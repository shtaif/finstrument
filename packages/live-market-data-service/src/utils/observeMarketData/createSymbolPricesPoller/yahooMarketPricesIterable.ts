import { asyncThrottle, execPipe as pipe, repeat } from 'iter-tools';
import { defer, of } from '@reactivex/ix-esnext-esm/asynciterable';
import {
  distinctUntilChanged,
  scan,
  publish,
} from '@reactivex/ix-esnext-esm/asynciterable/operators';
import {
  myIterableCleanupPatcher,
  itStartWith,
  itPairwise,
  itThrottle,
  itLazyDefer,
  itSwitchMap,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import { env } from '../../env.js';
import {
  getSymbolsCurrentPrices,
  type SymbolPrices,
  type SymbolPriceData,
} from '../getSymbolsCurrentPrices.js';

export { yahooMarketPricesIterable3 as default, type SymbolPrices, type SymbolPriceData };

function yahooMarketPricesIterable({
  symbols,
}: {
  symbols: MaybeAsyncIterable<string[]>;
}): AsyncIterable<SymbolPrices> {
  const symbolsIter = Symbol.asyncIterator in symbols ? symbols : of(symbols);

  return pipe(
    symbolsIter,
    itSwitchMap(currentRequestedSymbols => {
      console.log('currentRequestedSymbols', currentRequestedSymbols);
      return (async function* () {
        while (true) {
          const pricesData = await getSymbolsCurrentPrices({
            symbols: currentRequestedSymbols,
          });
          yield pricesData;
        }
      })();
    }),
    itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS)
  );
}

function yahooMarketPricesIterable2({
  symbols,
}: {
  symbols: MaybeAsyncIterable<string[]>;
}): AsyncIterable<SymbolPrices> {
  const symbolsIter = Symbol.asyncIterator in symbols ? symbols : of(symbols);

  // const persistentPacer = pipe(repeat(undefined), asyncThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS)/*, publish()*/);
  const persistentPacer = pipe(
    repeat(undefined),
    asyncThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS),
    throttler => {
      const throttlerIterator = throttler[Symbol.asyncIterator]();
      return { [Symbol.asyncIterator]: () => throttlerIterator };
    }
  );

  return pipe(
    symbolsIter,
    itSwitchMap(currentRequestedSymbols => {
      // console.log('currentRequestedSymbols', currentRequestedSymbols);

      const abortCtrl = new AbortController();

      return Object.assign(
        (async function* () {
          try {
            for await (const _ of persistentPacer) {
              const pricesData = await getSymbolsCurrentPrices({
                symbols: currentRequestedSymbols,
                signal: abortCtrl.signal,
              });
              yield pricesData;
            }
          } catch (err) {
            if (!abortCtrl.signal.aborted) {
              throw err;
            }
          }
        })(),
        {
          async return() {
            console.log('ABORTING');
            abortCtrl.abort();
            return { done: true, value: undefined };
          },
        }
      );
    })
  );
}

function yahooMarketPricesIterable3({
  symbols,
}: {
  symbols: MaybeAsyncIterable<string[]>;
}): AsyncIterable<SymbolPrices> {
  const symbolsIter = Symbol.asyncIterator in symbols ? symbols : of(symbols);

  return pipe(
    symbolsIter,
    itStartWith([] as string[]),
    itPairwise(),
    myIterableCleanupPatcher(requestedSymbolsPaired =>
      itLazyDefer(() => {
        let abortCtrl = new AbortController();

        return pipe(
          requestedSymbolsPaired,
          itSwitchMap(async function* ([prevRequestedSymbols, nowsRequestedSymbols]) {
            // console.log('nowsRequestedSymbols', nowsRequestedSymbols);

            if (nowsRequestedSymbols.length === 0) {
              if (prevRequestedSymbols.length > 0) {
                console.log('ABORTING LAST PRICES FETCH');
                abortCtrl.abort();
                abortCtrl = new AbortController();
              }
              return;
            }

            try {
              while (true) {
                const pricesData = await getSymbolsCurrentPrices({
                  symbols: nowsRequestedSymbols,
                  signal: abortCtrl.signal,
                });
                // console.log('BEFORE YIELD', pricesData);
                yield pricesData;
                // console.log('AFTER YIELD');
              }
            } catch (err) {
              if (!abortCtrl.signal.aborted) {
                throw err;
              }
            }
          })
        );
      })
    ),
    itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS)
  );
}

function yahooMarketPricesIterable4({
  symbols,
}: {
  symbols: MaybeAsyncIterable<string[]>;
}): AsyncIterable<SymbolPrices> {
  const symbolsIterable: AsyncIterable<string[]> =
    Symbol.asyncIterator in symbols ? symbols : of(symbols);

  return pipe(
    symbolsIterable,
    myIterableCleanupPatcher(symbolsIterable =>
      defer(() => {
        let symbolsIterator: AsyncIterator<string[]> | undefined;
        let abortCtrl = new AbortController();
        let closedAbruptly = false;

        return Object.assign(
          (async function* () {
            symbolsIterator = symbolsIterable[Symbol.asyncIterator]();
            let currSymbols: string[] = [];

            const initialNext = await symbolsIterator.next();
            if (!initialNext.done) {
              currSymbols = initialNext.value;
            }

            (async () => {
              for await (const nextSymbols of { [Symbol.asyncIterator]: () => symbolsIterator! }) {
                if (currSymbols.length > 0 && nextSymbols.length === 0) {
                  console.log('ABORTING LAST PRICES FETCH');
                  abortCtrl.abort();
                  abortCtrl = new AbortController();
                }
                currSymbols = nextSymbols;
              }
            })();

            while (true) {
              const currSignal = abortCtrl.signal;
              try {
                const pricesData = await getSymbolsCurrentPrices({
                  symbols: currSymbols,
                  signal: currSignal,
                });
                yield pricesData;
              } catch (err: any) {
                // if (!currSignal.aborted) {
                if (err.name !== 'AbortError') {
                  throw err;
                }
                if (closedAbruptly) {
                  break;
                }
                yield {};
              }
            }
          })(),
          {
            async return() {
              console.log('ABORTING DUE TO CLOSURE');
              closedAbruptly = true;
              await symbolsIterator?.return?.();
              abortCtrl.abort();
              return { done: true, value: undefined };
            },
          }
        );
      })
    ),
    itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS)
  );
}

// function yahooMarketPricesIterable6({
//   symbols,
// }: {
//   symbols: MaybeAsyncIterable<string[]>;
// }): AsyncIterable<SymbolPrices> {
//   return pipe(
//     Symbol.asyncIterator in symbols ? symbols : of(symbols),
//     (symbolsIterable: AsyncIterable<string[]>) =>
//       itLazyDefer<SymbolPrices>(async () => {
//         let abortCtrl = new AbortController();
//         let currSymbols: string[] = [];
//         const symbolsIterator = symbolsIterable[Symbol.asyncIterator]();

//         const initialNext = await symbolsIterator.next();

//         if (!initialNext.done) {
//           currSymbols = initialNext.value;
//         }

//         (async () => {
//           for await (const nextSymbols of {
//             [Symbol.asyncIterator]: () => symbolsIterator!,
//           }) {
//             if (currSymbols.length > 0 && nextSymbols.length === 0) {
//               abortCtrl.abort();
//               abortCtrl = new AbortController();
//             }
//             currSymbols = nextSymbols;
//           }
//         })();

//         return {
//           [Symbol.asyncIterator]() {
//             return this;
//           },

//           async next() {
//             try {
//               const pricesData = await getSymbolsCurrentPrices({
//                 symbols: currSymbols,
//                 signal: abortCtrl.signal,
//               });
//               return { done: false as const, value: pricesData };
//             } catch (err: any) {
//               if (err.name === 'AbortError') {
//                 return { done: false as const, value: {} };
//               }
//               throw err;
//             }
//           },

//           async return() {
//             // abortCtrl.abort();
//             await symbolsIterator?.return?.();
//             abortCtrl.abort();
//             return { done: true as const, value: undefined };
//           },
//         };
//       }),
//     itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS)
//   );
// }
