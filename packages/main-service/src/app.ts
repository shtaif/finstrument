// import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createServer } from 'node:http';
import express from 'express';
import expressCors from 'cors';
import { json as expressJson } from 'body-parser';
import { createHttpTerminator } from 'http-terminator';
import { WebSocket, WebSocketServer } from 'ws';
import { subscribe, GraphQLError } from 'graphql/index.js';
import { type ExecutionResult } from 'graphql-ws';
import { useServer as graphqlWsUseServer } from 'graphql-ws/lib/use/ws';
import { env } from './utils/env.js';
import { mainRedisClient, subscriberRedisClient } from './utils/redisClients.js';
import { UserModel, initDbSchema } from './db/index.js';
import appApiRoutes from './appApiRoutes/index.js';
import { initedGqlSchema, appGqlContext } from './initGqlSchema/index.js';
import { createGraphqlAppMiddleware } from './graphqlAppMiddleware/index.js';
// import positionsService from './utils/positionsService/index.js';

export { startApp };

async function startApp(): Promise<() => Promise<void>> {
  // console.time('____________________');

  const httpServer = createServer(
    express()
      .use(expressCors({}))
      .use(expressJson({ limit: '100kb' }))
      .use('/api', appApiRoutes)
      .use('/graphql', (await createGraphqlAppMiddleware()).graphqlAppMiddleware)
  );

  const gqlWsServer = graphqlWsUseServer(
    {
      schema: initedGqlSchema,
      context: (ctxStuff, subscribeMessage, executionArgs) =>
        appGqlContext({ ctxStuff, subscribeMessage, executionArgs }),
      // onError(ctx, message, errors) {
      //   console.error('!!!!!', message);
      // },
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
              const nextItem = await originalNext();
              return nextItem;
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

  const [[user] /*, testLedgerCsv*/] = await Promise.all([
    UserModel.findOrCreate({ where: { alias: 'dorshtaif' } }),
    // readFile(`${import.meta.dirname}/my-test-ledger.csv`, 'utf-8'),
  ]);

  const ___csvData___1 = `
  Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
  Trades,Data,Stocks,ADBE,"2023-01-01, 00:00:00",5,100.00
  Trades,Data,Stocks,ADBE,"2023-01-03, 00:00:00",-1,140.00
  Trades,Data,Stocks,ADBE,"2023-01-04, 00:00:00",-1,160.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
    `.trim();

  const ___csvData___2 = `
  Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
  Trades,Data,Stocks,ADBE,"2023-01-01, 00:00:00",5,100.00
  Trades,Data,Stocks,ADBE,"2023-01-02, 00:00:00",4,120.00
  Trades,Data,Stocks,ADBE,"2023-01-03, 00:00:00",-6,140.00
  Trades,Data,Stocks,ADBE,"2023-01-04, 00:00:00",-1,160.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
  Trades,Data,Stocks,ADBE,"2023-09-09, 00:00:00",9,99.00
  Trades,Data,Stocks,AAPL,"2023-02-01, 00:00:00",5,200.00
  Trades,Data,Stocks,AAPL,"2023-02-02, 00:00:00",4,220.00
  Trades,Data,Stocks,AAPL,"2023-02-03, 00:00:00",-2,240.00
  Trades,Data,Stocks,AAPL,"2023-02-04, 00:00:00",-1,260.00
    `.trim();

  try {
    //   // await positionsService.setPositions({
    //   //   ownerAlias: user.alias,
    //   //   csvData: testLedgerCsv,
    //   // });
    // await positionsService.setPositions({
    //   mode: 'REPLACE',
    //   ownerAlias: user.alias,
    //   csvData: ___csvData___2,
    // });
    // await positionsService.setPositions({
    //   mode: 'REPLACE',
    //   ownerAlias: user.alias,
    //   csvData: ___csvData___1,
    // });
    //   // await positionsService.setPositions({
    //   //   mode: 'MERGE',
    //   //   ownerAlias: user.alias,
    //   //   csvData: ___csvData___2,
    //   // });
  } catch (err: any) {
    console.error(err);
    throw err;
  }

  // (async () => {
  //   try {
  //     const revenueDataUpdates = liveRevenueData({ ownerAlias: 'dorshtaif' });
  //     for await (const revDataUpdate of revenueDataUpdates) {
  //       console.log('revDataUpdate!!!!!!!!!!!', JSON.stringify(revDataUpdate, undefined, 2));
  //     }
  //   } catch (err: any) {
  //     console.error(err);
  //     throw err;
  //   }
  // })();

  {
    // const positions = await positionsService.retrievePositions({
    //   filters: {
    //     ownerAlias: 'dorshtaif',
    //     symbols: [],
    //     positionIds: [],
    //     status: ['OPEN', 'CLOSED'],
    //   },
    //   orderBy: ['openedAt', 'DESC'],
    // });
    // console.log('!'.repeat(45), JSON.stringify(positions, undefined, 2));
  }

  {
    // const holdings = await positionsService.retrieveHoldingStats({
    //   filters: {
    //     ownerAliases: ['dorshtaif'],
    //     symbols: [],
    //   },
    //   pagination: { offset: 0 },
    //   orderBy: ['lastChangedAt', 'DESC'],
    // });
    // console.log('!'.repeat(45), JSON.stringify(holdings, undefined, 2));
  }

  {
    // const holdingChanges = await positionsService.retrieveHoldingStatsChanges({
    //   filters: {
    //     ownerAliases: ['dorshtaif'],
    //     symbols: [],
    //   },
    //   pagination: { offset: 0 },
    //   orderBy: ['changedAt', 'DESC'],
    // });
    // console.log('!'.repeat(45), JSON.stringify(holdingChanges, undefined, 2));
  }

  {
    // const portfolioChanges = await positionsService.retrievePortfolioStatsChanges({
    //   filters: {
    //     latestPerOwner: true,
    //     ownerAliases: ['dorshtaif'],
    //   },
    //   includeCompositions: true,
    //   pagination: { offset: 0 },
    //   orderBy: ['lastChangedAt', 'DESC'],
    // });
    // console.log('!'.repeat(45), JSON.stringify(portfolioChanges, undefined, 2));
  }

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

// async function testGqlSubscriptionViaWebSocket() {
//   try {
//     const { WebSocket } = await import('ws');
//     const { createClient } = await import('graphql-ws');

//     const client = createClient({
//       url: `ws://localhost:${env.PORT}/graphql`,
//       webSocketImpl: class extends WebSocket {
//         send(data: any, cb: any) {
//           console.log('SENT DATA', data);
//           return super.send(data, cb);
//         }
//       },
//     });

//     const subscription = client.iterate({
//       query: `#graphql
//         subscription {
//           observePricesData (
//             input: { symbols: ["voo", "splg"] }
//           ) {
//             priceUpdates {
//               regularMarketPrice
//               regularMarketTime
//             }
//           }
//         }
//     `,
//     });

//     for await (const event of subscription) {
//       console.log('EVENT', event);
//       break;
//     }
//     console.log('ENDED ITERATION');
//   } catch (err) {
//     console.error(err);
//     throw err;
//   }
// }

/*

const serviceBaseUrl = '______________________';
const es = new EventSource(`${serviceBaseUrl}/live-symbol-prices?symbols=voo,splg,intc,nvda`);
es.addEventListener('message', ev => {
	console.log(JSON.parse(ev.data));
});

*/
