// // import { setTimeout } from 'node:timers/promises';
// import { z } from 'zod';
// import { pipe } from 'shared-utils';
// import { itSwitchMap, itMap } from 'iterable-operators';
// // import { type RouteHandlerFn } from '../../createWebSocketApp/index.js';
// import { observeMarketData } from '../../utils/observeMarketData/index.js';

// export { appWsHandlers };

// const appWsHandlers = {
//   '/market-data': (_ws, messages) => {
//     return pipe(
//       messages,
//       itMap(msg => marketDataInboundMessageSchema.parse(msg)),
//       itSwitchMap(validatedMsg => observeMarketData({ symbols: validatedMsg.symbols }))
//     );
//   },
// } satisfies { [route: string]: Function };

// const marketDataInboundMessageSchema = z.object({
//   symbols: z
//     .array(z.string())
//     .transform(symbols => symbols.map(symbol => symbol.trim()).filter(Boolean)),
// });

// // (async () => {
// //   const iter = observeMarketData({ symbols: ['ADBE'] });
// //   const it = iter[Symbol.asyncIterator]();

// //   const firstNextPromise = it.next();
// //   const firstNext = await firstNextPromise;
// //   console.log('firstNext', firstNext);

// //   const secondNextPromise = it.next();
// //   const ThirdNextPromise = it.next();
// //   const returnResult = await it.return!();
// //   console.log('returnResult', returnResult);
// //   const secondNext = await secondNextPromise;
// //   const thirdNext = await ThirdNextPromise;
// //   console.log('secondNext', secondNext);
// //   console.log('thirdNext', thirdNext);
// // })();

// // (async () => {
// //   await new Promise<void>(resolve => setTimeout(resolve, 500));

// //   const it1 = observeMarketData({ symbols: ['ADBE'] })[Symbol.asyncIterator]();
// //   const it2 = observeMarketData({ symbols: ['ADBE'] })[Symbol.asyncIterator]();

// //   (async () => {
// //     for await (const _ of { [Symbol.asyncIterator]: () => it1 });
// //   })();

// //   (async () => {
// //     for await (const _ of { [Symbol.asyncIterator]: () => it2 });
// //   })();

// //   await new Promise<void>(resolve => setTimeout(resolve, 4000));
// //   await it1.return!();
// //   await new Promise<void>(resolve => setTimeout(resolve, 2000));
// //   await it2.return!();
// // })();
