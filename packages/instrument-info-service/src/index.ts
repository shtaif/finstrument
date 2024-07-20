import { once } from 'events';
import { createServer } from 'http';
import express from 'express';
import { json as expressJson } from 'body-parser';
import { createHttpTerminator } from 'http-terminator';
// import yahooFinance from 'yahoo-finance2';
import { env } from './utils/env';
import { sequelize } from './db/index.js';
import appApiRoutes from './appApiRoutes';

(async () => {
  const httpServer = createServer(
    express()
      .use(expressJson({ limit: '100kb' }))
      .use('/api', appApiRoutes)
  );

  const httpTerminator = createHttpTerminator({
    server: httpServer,
    gracefulTerminationTimeout: 4500,
  });

  await Promise.all([
    (async () => {
      // await sequelize.authenticate();
      await sequelize.sync({ alter: true, force: false });
      // await sequelize.query(`
      //   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      // `);
      // await sequelize.query(`
      //   CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_alias_idx"
      //     ON "${UserModel.tableName}" USING btree
      //     ("${UserModel.getAttributes().alias.field}");
      // `);
      // await sequelize.query(`
      //   CREATE INDEX CONCURRENTLY IF NOT EXISTS "symbol_and_owner_id_idx"
      //     ON "${TradeRecordModel.tableName}" USING btree
      //     ("${TradeRecordModel.getAttributes().symbol.field}", "${TradeRecordModel.getAttributes().ownerId.field}");
      // `);
    })(),
  ]);

  // const results = await getInstrumentInfos({
  //   symbols: ['VUAG.L', 'VUAA.MI', 'QQQ', 'VOO'],
  // });

  // const result = await yahooFinance.quote(['VUSD'], {});

  // const results = await yahooFinance.quote(['VUAG.L', 'VUAA.MI', 'QQQ', 'VOO'], {
  //   // fields: ['fullExchangeName', 'market', 'currency'],
  //   return: 'object',
  //   // { fetchOptions: { signal } }
  // });

  // const results2 = mapValues(results, info => {
  //   const exchangeCountryCode = info.market.slice(0, 2).toUpperCase();
  //   return {
  //     exchangeFullName: info.fullExchangeName,
  //     exchangeCountryCode,
  //     exchangeCountryFlagEmoji: countryCodeToFlagEmoji(exchangeCountryCode),
  //     currency: info.currency,
  //   };
  // });

  // console.log(JSON.stringify(result, undefined, 2));

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
    `🚀 Server listening on port ${env.PORT}${
      ngrokPublicUrl ? `, public URL: ${ngrokPublicUrl}` : ''
    }`
  );

  if (env.NODE_ENV === 'production') {
    await Promise.race(['SIGTERM', 'SIGINT'].map(signal => once(process, signal)));
    await Promise.all([httpTerminator.terminate()]);
  }
})();
