import { Server as HttpServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import Session from 'supertokens-node/recipe/session';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { subscribe, GraphQLError } from 'graphql/index.js';
import { type ExecutionResult } from 'graphql-ws';
import { useServer as graphqlWsUseServer } from 'graphql-ws/lib/use/ws';
import { initedGqlSchema, appGqlContext } from '../initGqlSchema/index.js';

export { graphqlWsServer };

function graphqlWsServer({ httpServer }: { httpServer: HttpServer }) {
  return graphqlWsUseServer(
    {
      schema: initedGqlSchema,
      context: async (ctxStuff, _subscribeMessage, _executionArgs) => {
        return await appGqlContext({
          getSession: async () => {
            const accessToken = ctxStuff.connectionParams?.accessToken as string | undefined;
            const userId = (await manuallyParseStAccessToken({ accessToken }))?.userId;
            return {
              activeUserId: userId,
            };
          },
        });
      },
      async subscribe(executionArgs): Promise<ExecutionResult | AsyncIterable<ExecutionResult>> {
        // The underlying `graphql-js` lib catches thrown errors / promise rejections from resolvers and
        // formats them as part of the result (in the "errors" property alongside "data") but it does not
        // do so with errors thrown in async iterables in subscription resolvers (at the moment?),
        // where it just lets these bubble up leaving it to the enclosing engine's default error
        // handling behavior (which in the case of a `graphql-ws`-powered backend, is to ungracefully
        // terminate the subscription).
        //
        // More info on https://github.com/enisdenjo/graphql-ws/discussions/561#discussioncomment-9645311.
        //
        // The following patching adapted from the above link tries to align such
        // async iterable thrown errors to be conveyed in the result structure as mentioned, like in
        // the other error cases.

        const result = await subscribe(executionArgs);

        if (Symbol.asyncIterator in result) {
          const originalNext = result.next;
          result.next = async () => {
            try {
              return await originalNext();
            } catch (err: any) {
              const { message: errMessage, ...restEnumerablePropsOfErr } = err;
              const gqlError = new GraphQLError(errMessage, {
                extensions: restEnumerablePropsOfErr,
              });
              return {
                value: {
                  data: null,
                  errors: [gqlError],
                },
              };
            }
          };
        }

        return result;
      },
    },
    new WebSocketServer({
      server: httpServer,
      path: '/graphql',
      perMessageDeflate: true,
      WebSocket,
    })
  );
}

async function manuallyParseStAccessToken(args: {
  accessToken: string | undefined;
}): Promise<Session.SessionInformation | undefined> {
  const { accessToken } = args;

  if (!accessToken) {
    return;
  }

  const decodedJwt = await new Promise<JwtPayload>((resolve, reject) => {
    jwt.verify(
      accessToken,
      async (jwtHeader, cb) => {
        try {
          const jwk = (await Session.getJWKS()).keys.find(({ kid }) => kid === jwtHeader.kid);
          cb(null, { format: 'jwk', key: jwk! });
        } catch (err: any) {
          cb(err);
        }
      },
      {},
      (err, decodedJwt) => {
        err ? reject(err) : resolve(decodedJwt! as JwtPayload);
      }
    );
  });

  const stSessionInfo = await Session.getSessionInformation(decodedJwt.sessionHandle);
  return stSessionInfo;
}
