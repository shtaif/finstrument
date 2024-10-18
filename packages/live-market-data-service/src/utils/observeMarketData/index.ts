import { setImmediate } from 'node:timers/promises';
import { uniq, flatten, pick } from 'lodash-es';
import { pipe } from 'shared-utils';
import { iterifiedUnwrapped } from 'iterified';
import { asyncIterMap, itTakeFirst, myIterableCleanupPatcher } from 'iterable-operators';
import {
  yahooMarketPricesIterable,
  type SymbolPrices,
  type SymbolPriceData,
} from './yahooMarketPricesIterable/index.js';

export { observeMarketData, marketDataPrimeFasterInit, type SymbolPrices, type SymbolPriceData };

function observeMarketData(params: { symbols: string[] }): AsyncIterable<SymbolPrices> {
  // TODO: Make `symbols` parameter be providable as an async iterable as well as a static array?

  const symbolsNormalized = params.symbols.map(symbol => symbol.trim().toUpperCase());

  if (symbolsNormalized.length === 0) {
    return (async function* () {
      yield {};
    })();
  }

  return pipe(
    baseSymbolPricesPoller,
    myIterableCleanupPatcher(
      (pricesIterable): AsyncIterable<SymbolPrices> => ({
        [Symbol.asyncIterator]: () => {
          const pricesIterator = pricesIterable[Symbol.asyncIterator]();
          const gen = (async function* () {
            try {
              setImmediate().then(() =>
                observedSymbolsChangeNotifications.next({ add: symbolsNormalized })
              );
              yield* { [Symbol.asyncIterator]: () => pricesIterator };
            } finally {
              console.log('FINALLY CALLED');
            }
          })();
          return Object.assign(gen, {
            async return() {
              observedSymbolsChangeNotifications.next({ remove: symbolsNormalized });
              await pricesIterator.return!();
              return { done: true as const, value: undefined };
            },
          });
        },
      })
    ),
    asyncIterMap(prices => pick(prices, symbolsNormalized))
  );
}

const observedSymbolsChangeNotifications = iterifiedUnwrapped<{
  add?: string[];
  remove?: string[];
}>();

const baseSymbolPricesPoller = pipe(
  observedSymbolsChangeNotifications.iterable,
  myIterableCleanupPatcher(async function* (source) {
    const currSymbolSet = new Set<string[]>();
    for await (const nextSymbols of source) {
      if (nextSymbols.add) {
        currSymbolSet.add(nextSymbols.add);
      }
      if (nextSymbols.remove) {
        currSymbolSet.delete(nextSymbols.remove);
      }
      yield currSymbolSet;
    }
  }),
  asyncIterMap(currSymbolSet => pipe([...currSymbolSet], flatten, uniq)),
  observedSymbolsIter => yahooMarketPricesIterable({ symbols: observedSymbolsIter })
);

async function marketDataPrimeFasterInit(): Promise<void> {
  await pipe(yahooMarketPricesIterable({ symbols: ['SPX'] }), itTakeFirst());
}

// (async () => {
//   await new Promise(resolve => setTimeout(resolve, 0));

//   // (async () => {
//   //   for await (const _ of baseSymbolPricesPoller);
//   // })();

//   for (const symbol of ['VOO', 'VOOG', 'SPLG', 'QQQ']) {
//     const it = observeMarketData({ symbols: [symbol] })[Symbol.asyncIterator]();
//     console.log((await it.next()).value);
//     await it.return!();
//   }
// })();

// (async () => {
//   const iter = observeMarketData({ symbols: ['qqq'] });

//   for (let i = 0; i < 2; ++i) {
//     const it = iter[Symbol.asyncIterator]();

//     console.log('****** RECEIVING VALUE...');
//     await it.next().then(value => console.log('****** VALUE RECEIVED:', value));

//     console.log('****** RECEIVING VALUE...');
//     it.next().then(value => console.log('****** VALUE RECEIVED:', value));

//     // await setImmediate();
//     // await setImmediate();

//     console.log('****** RETURNING...');
//     await it.return!();
//     console.log('****** RETURNED!');

//     // await setImmediate();
//     // await setImmediate();
//   }
// })();

// (async () => {
//   const iter = observeMarketData({ symbols: ['qqq'] });

//   for await (const item of iter) {
//     console.log('LOOP 1', item);
//     break;
//   }
//   for await (const item of iter) {
//     console.log('LOOP 2', item);
//     break;
//   }
//   for await (const item of iter) {
//     console.log('LOOP 3', item);
//     break;
//   }
//   for await (const item of iter) {
//     console.log('LOOP 4', item);
//     break;
//   }
//   for await (const item of iter) {
//     console.log('LOOP 5', item);
//     break;
//   }
// })();

// (async () => {
//   await require('node:timers/promises').setTimeout(2000);

//   const pricesIter = observeMarketData({
//     symbols: ['qqq'],
//   });

//   try {
//     for await (const pricesData of pricesIter) {
//       console.log('pricesData', pricesData);
//     }
//   } catch (err) {
//     console.error('ERROR', err);
//   }
// })();

// (async () => {
//   try {
//     const iter1 = observeMarketData({ symbols: ['voo', 'voog'] });
//     const iterator1 = iter1[Symbol.asyncIterator]();
//     console.log('FROM iterator1', await iterator1.next());

//     const iter2 = observeMarketData({ symbols: ['splg', 'spyg'] });
//     const iterator2 = iter2[Symbol.asyncIterator]();
//     console.log('FROM iterator2', await iterator2.next());

//     await Promise.all([iterator1.return!(), iterator2.return!()]);
//     console.log('DONE');
//   } catch (err) {
//     console.error('ERROR', err);
//   }
// })();

// (async () => {
//   const iter1 = pipe(observeMarketData({ symbols: ['aapl', 'msft'] }));
//   const iterator1 = iter1[Symbol.asyncIterator]();

//   const iter2 = pipe(observeMarketData({ symbols: ['voo', 'voog'] }));
//   const iterator2 = iter2[Symbol.asyncIterator]();

//   console.log('STARTING');

//   await Promise.all([iterator1.next(), iterator2.next()]);
//   iterator1.next();
//   iterator2.next();

//   await new Promise(resolve => setTimeout(resolve, 100));

//   await Promise.all([iterator1.return!(), iterator2.return!()]);

//   console.log('DONE');
// })();

// (async () => {
//   const iter = observeMarketData({ symbols: ['voo', 'splg'] });
//   let counter = 0;

//   const iterator = iter[Symbol.asyncIterator]();

//   setTimeout(async () => {
//     console.log('TRYING TO .RETURN() THE ITERATOR');
//     await iterator.return?.();
//     console.log('ITERATOR RETURNED');
//   }, 4500);

//   while (true) {
//     const item = await iterator.next();
//     if (item.done) {
//       break;
//     }
//     if (++counter >= 3) {
//       console.log('CLOSING CONSUMER');
//       break;
//     }
//   }

//   console.log('CONSUMER CLOSED');

//   await (async () => {
//     const iter = observeMarketData({ symbols: ['voo', 'splg'] });
//     let counter = 0;

//     const iterator = iter[Symbol.asyncIterator]();

//     setTimeout(async () => {
//       console.log('TRYING TO .RETURN() THE ITERATOR');
//       await iterator.return?.();
//       console.log('ITERATOR RETURNED');
//     }, 4500);

//     while (true) {
//       const item = await iterator.next();
//       if (item.done) {
//         break;
//       }
//       if (++counter >= 3) {
//         console.log('CLOSING CONSUMER');
//         break;
//       }
//     }

//     console.log('CONSUMER CLOSED');
//   })();
// })();

// (async () => {
//   const iterable1 = observeMarketData({ symbols: ['voo', 'voog'] });
//   const iterable2 = observeMarketData({ symbols: ['voo', 'vgt'] });

//   (async () => {
//     for await (const item of iterable1) {
//       console.log('ITERABLE 1 ITERATOR 1 EMITS', item);
//     }
//   })();
//   (async () => {
//     for await (const item of iterable1) {
//       console.log('ITERABLE 1 ITERATOR 2 EMITS', item);
//     }
//   })();

//   (async () => {
//     for await (const item of iterable2) {
//       console.log('ITERABLE 2 ITERATOR 1 EMITS', item);
//       break;
//     }
//   })();
//   (async () => {
//     for await (const item of iterable2) {
//       console.log('ITERABLE 2 ITERATOR 2 EMITS', item);
//       break;
//     }
//   })();
// })();
