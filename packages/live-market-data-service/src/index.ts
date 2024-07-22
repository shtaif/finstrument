import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import expressCors from 'cors';
import expressBodyParser from 'body-parser';
import { createHttpTerminator } from 'http-terminator';
import { env } from './utils/env.js';
import { marketDataPrimeFasterInit } from './utils/observeMarketData/index.js';
import { listenWebSocketApp } from './createWebSocketApp/index.js';
import { appApiRoutes } from './appApiRoutes/index.js';

(async () => {
  const httpServer = createServer(
    express()
      .use(expressCors({}))
      .use(expressBodyParser.json({ limit: '100kb' }))
      .use('/api', appApiRoutes)
  );

  const webSocketApp = listenWebSocketApp({ server: httpServer });

  const httpTerminator = createHttpTerminator({
    server: httpServer,
    gracefulTerminationTimeout: 5000,
  });

  marketDataPrimeFasterInit();

  const [, , ngrokPublicUrl] = await Promise.all([
    (async () => {
      httpServer.listen(env.PORT);
      await once(httpServer as unknown as EventTarget, 'listening');
    })(),

    once(webSocketApp, 'listening'),

    env.ENABLE_NGROK_TUNNEL
      ? (async () => {
          const { default: ngrok } = await import('@ngrok/ngrok');
          return await ngrok.connect({ addr: env.PORT });
        })()
      : undefined,
  ]);

  console.log(
    [
      `🚀 Server listening on port ${env.PORT}`,
      ngrokPublicUrl ? `, public URL: ${ngrokPublicUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n')
  );

  if (env.NODE_ENV === 'production') {
    await Promise.race(['SIGTERM', 'SIGINT'].map(signal => once(process, signal)));
    await httpTerminator.terminate();
    await new Promise<void>((resolve, reject) =>
      webSocketApp.close(err => {
        err ? reject(err) : resolve();
      })
    );
  }
})();
