import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import StSession from 'supertokens-node/recipe/session';
import { initedGqlSchema } from '../initGqlSchema/index.js';
import { appGqlContext, type AppGqlContextValue } from '../initGqlSchema/appGqlContext.js';

export { createGraphqlAppMiddleware };

async function createGraphqlAppMiddleware(): Promise<{
  graphqlAppMiddleware: express.RequestHandler;
}> {
  const apolloServer = new ApolloServer<AppGqlContextValue>({
    schema: initedGqlSchema,
    plugins: [],
    introspection: true,
    status400ForVariableCoercionErrors: true,
    nodeEnv: 'development', // This is given to force the GraphQL Explorer UI to be available ALSO in production for the meantime
    includeStacktraceInErrorResponses: false,
  });

  await apolloServer.start();

  return {
    graphqlAppMiddleware: expressMiddleware(apolloServer, {
      context: async expressCtxFunctionArg => {
        return await appGqlContext({
          getSession: async () => {
            const stSession = await StSession.getSession(
              expressCtxFunctionArg.req,
              expressCtxFunctionArg.res,
              { sessionRequired: false }
            );
            const userId = stSession?.getUserId();
            return {
              activeUserId: userId,
            };
          },
        });
      },
    }),
  };
}
