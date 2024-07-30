import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import expressCors from 'cors';
import { json as expressJson } from 'body-parser';
import { createHttpTerminator } from 'http-terminator';
import { env } from './utils/env.js';
import { mainRedisClient, subscriberRedisClient } from './utils/redisClients.js';
import { UserModel, initDbSchema } from './db/index.js';
import appApiRoutes from './appApiRoutes/index.js';
import { createGraphqlAppMiddleware } from './graphqlAppMiddleware/index.js';
import { graphqlWsServer } from './graphqlWsServer/index.js';

export { startApp };

async function startApp(): Promise<() => Promise<void>> {
  const httpServer = createServer(
    express()
      .use(expressCors({}))
      .use(expressJson({ limit: '100kb' }))
      .use('/api', appApiRoutes)
      .use('/graphql', (await createGraphqlAppMiddleware()).graphqlAppMiddleware)
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

  const [, ngrokPublicUrl, user] = await Promise.all([
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
    UserModel.findOrCreate({ where: { alias: 'dorshtaif' } }),
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
