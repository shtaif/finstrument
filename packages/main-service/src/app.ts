import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import expressCors from 'cors';
import { json as expressJson } from 'body-parser';
import { createHttpTerminator } from 'http-terminator';
import supertokens from 'supertokens-node';
import {
  middleware as supertokensMw,
  errorHandler as supertokensErrorHandlerMw,
} from 'supertokens-node/framework/express';
import { verifySession as supertokensVerifySessionMw } from 'supertokens-node/recipe/session/framework/express';
import { env } from './utils/env.js';
import { mainRedisClient, subscriberRedisClient } from './utils/redisClients.js';
import { initDbSchema } from './db/index.js';
import appApiRoutes from './appApiRoutes/index.js';
import { initSuperTokens } from './initSuperTokens/index.js';
import { createGraphqlAppMiddleware } from './graphqlAppMiddleware/index.js';
import { graphqlWsServer } from './graphqlWsServer/index.js';

export { startApp };

async function startApp(): Promise<() => Promise<void>> {
  // TODO: Completely rename whole monorepo as well as recurring terms from "finstrument" into "instrumental"

  const supertokensAuthEndpointsBasePath = '/auth';

  initSuperTokens({
    superTokensCoreUrl: env.SUPERTOKENS_CORE_URL,
    apiDomain: env.APP_PUBLIC_URL,
    websiteDomain: env.AUTH_FRONTEND_ORIGIN_URL,
    sessionCookieDomain: env.AUTH_SESSION_COOKIE_DOMAIN,
    authEndpointsBasePath: supertokensAuthEndpointsBasePath,
  });

  const httpServer = createServer(
    express()
      .use(
        expressCors({
          origin: env.AUTH_FRONTEND_ORIGIN_URL,
          allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
          methods: ['GET', 'PATCH', 'PUT', 'POST', 'DELETE'],
          credentials: true,
        })
      )
      .use(expressJson({ limit: '100kb' }))
      .use(supertokensAuthEndpointsBasePath, supertokensMw())
      .use('/api', supertokensVerifySessionMw({ sessionRequired: false }), appApiRoutes)
      .use(
        '/graphql',
        supertokensVerifySessionMw({ sessionRequired: false }),
        (await createGraphqlAppMiddleware()).graphqlAppMiddleware
      )
      .use(supertokensErrorHandlerMw())
    // TODO: Add last global error handler middleware right here?
  );

  const gqlWsServer = graphqlWsServer({ httpServer });

  const httpTerminator = createHttpTerminator({
    server: httpServer,
    gracefulTerminationTimeout: 4500,
  });

  await Promise.all([
    initDbSchema(),
    mainRedisClient.connect().catch((err: any) => {
      throw new Error(
        `Failed to connect to Redis with url "${mainRedisClient.options?.url}" (should recheck all other options as well!)`,
        { cause: err }
      );
    }),
    subscriberRedisClient.connect().catch((err: any) => {
      throw new Error(
        `Failed to connect to Redis with url "${subscriberRedisClient.options?.url}" (should recheck all other options as well!)`,
        { cause: err }
      );
    }),
  ]);

  const [, ngrokPublicUrl] = await Promise.all([
    (async () => {
      httpServer.listen(env.PORT);
      await once(httpServer, 'listening');
    })(),
    env.ENABLE_NGROK_TUNNEL
      ? (async () => {
          const { default: ngrok } = await import('@ngrok/ngrok');
          return await ngrok.connect({ addr: env.PORT });
        })()
      : undefined,
  ]);

  console.log(
    `🚀 Server listening on http://127.0.0.1:${env.PORT}${
      ngrokPublicUrl ? `, public URL: ${ngrokPublicUrl}` : ''
    }, GraphQL studio available via http://127.0.0.1:${env.PORT}/graphql`
  );

  return async () => {
    await Promise.all([httpServer.listening && httpTerminator.terminate(), gqlWsServer.dispose()]);
    await Promise.all([mainRedisClient.disconnect(), subscriberRedisClient.disconnect()]);
  };
}
