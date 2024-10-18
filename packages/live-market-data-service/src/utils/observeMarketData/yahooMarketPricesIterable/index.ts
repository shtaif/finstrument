import { pickBy, isEmpty, partition, pick, compact } from 'lodash-es';
import { asyncMap, asyncFilter, asyncTake, asyncConcat } from 'iter-tools';
import { of } from '@reactivex/ix-esnext-esm/asynciterable/of.js';
import yahooFinance from 'yahoo-finance2';
import {
  itPairwise,
  itStartWith,
  itMap,
  itTap,
  itLazyDefer,
  myIterableCleanupPatcher,
  itSwitchMap,
  itCatch,
  itThrottle,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import { objectFromEntriesTyped, parseSymbol, pipe } from 'shared-utils';
import { env } from '../../env.js';
import {
  getSymbolsCurrentPrices,
  type SymbolPrices,
  type SymbolPriceData,
} from './getSymbolsCurrentPrices.js';

export { yahooMarketPricesIterable, type SymbolPrices, type SymbolPriceData };

yahooFinance.setGlobalConfig({
  validation: { logErrors: false },
});

function yahooMarketPricesIterable(params: {
  symbols: MaybeAsyncIterable<string[]>;
}): AsyncIterable<SymbolPrices> {
  const { symbols } = params;

  const symbolsIter = Symbol.asyncIterator in symbols ? symbols : of(symbols);

  return pipe(
    symbolsIter,
    itMap(requestedSymbols => requestedSymbols.map(parseSymbol)),
    symbolsIter =>
      itLazyDefer(() => {
        let abortCtrl = new AbortController();
        let prevPriceData: SymbolPrices = {};

        return pipe(
          symbolsIter,
          itSwitchMap(parsedSymbols =>
            pipe(
              (async function* () {
                if (parsedSymbols.length === 0) {
                  abortCtrl.abort();
                  abortCtrl = new AbortController();
                  return;
                }
                while (true) yield;
              })(),
              itMap(async () => {
                const [currencyOverriddenSymbols, restSymbols] = partition(
                  parsedSymbols,
                  s => !!s.currencyOverride
                );

                const [
                  currencyOverriddenSymbolsExistingInPrev,
                  currencyOverriddenSymbolsMissingFromPrev,
                ] = partition(
                  currencyOverriddenSymbols,
                  s => !!prevPriceData[s.baseInstrumentSymbol]
                );

                const currencyOverriddenSymbolsPriceData = {
                  ...pick(
                    prevPriceData,
                    currencyOverriddenSymbolsExistingInPrev.map(s => s.baseInstrumentSymbol)
                  ),
                  ...(await getSymbolsCurrentPrices({
                    signal: abortCtrl.signal,
                    symbols: currencyOverriddenSymbolsMissingFromPrev.map(
                      s => s.baseInstrumentSymbol
                    ),
                  })),
                };

                return (prevPriceData = await getSymbolsCurrentPrices({
                  signal: abortCtrl.signal,
                  symbols: [
                    ...restSymbols.map(s => s.baseInstrumentSymbol),
                    ...currencyOverriddenSymbols
                      .filter(s => !!currencyOverriddenSymbolsPriceData[s.baseInstrumentSymbol])
                      .map(
                        s =>
                          `${currencyOverriddenSymbolsPriceData[s.baseInstrumentSymbol]!.currency}${s.currencyOverride}=X`
                      ),
                  ],
                }));
              }),
              itCatch(err => {
                if (abortCtrl.signal.aborted) {
                  return (async function* () {})();
                }
                throw err;
              }),
              itMap(priceDatas =>
                pipe(
                  parsedSymbols.map(s => {
                    if (!priceDatas[s.baseInstrumentSymbol]) {
                      return;
                    }

                    if (!s.currencyOverride) {
                      return [s.normalizedFullSymbol, priceDatas[s.baseInstrumentSymbol]] as const;
                    }

                    const instPriceData = priceDatas[s.baseInstrumentSymbol]!;
                    const overrideCurrencyPriceData =
                      priceDatas[`${instPriceData.currency}${s.currencyOverride}=X`];

                    const overriddenPriceData = {
                      quoteSourceName: instPriceData.quoteSourceName,
                      marketState: instPriceData.marketState,
                      currency: s.currencyOverride,
                      regularMarketTime:
                        (overrideCurrencyPriceData?.regularMarketTime ?? 0) >
                        (instPriceData?.regularMarketTime ?? 0)
                          ? overrideCurrencyPriceData?.regularMarketTime
                          : instPriceData?.regularMarketTime,
                      regularMarketPrice:
                        !!instPriceData.regularMarketPrice &&
                        !!overrideCurrencyPriceData!.regularMarketPrice
                          ? instPriceData.regularMarketPrice *
                            overrideCurrencyPriceData!.regularMarketPrice
                          : undefined,
                    };

                    return [s.normalizedFullSymbol, overriddenPriceData] as const;
                  }),
                  $ => compact($),
                  $ => objectFromEntriesTyped($)
                )
              )
            )
          )
        );
      }),
    itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS),
    itStartWith({} as SymbolPrices),
    itPairwise(),
    itMap(([prevPrices, nowsPrices]) => {
      const changedOrInitialPrices = pickBy(nowsPrices!, (_, symbol) => {
        const [nowsPriceTime, previousPriceTime, nowsPrice, previousPrice] = [
          nowsPrices[symbol]?.regularMarketTime?.getTime(),
          prevPrices[symbol]?.regularMarketTime?.getTime(),
          nowsPrices[symbol]?.regularMarketPrice,
          prevPrices[symbol]?.regularMarketPrice,
        ];
        return nowsPriceTime !== previousPriceTime || nowsPrice !== previousPrice;
      });
      // TODO: Possibly, right now, the `prevPrices` prices from which the `changedFromLast` are calculated from are stateful and persisting so might be not up to date when there are some time gaps during consumption of this
      return {
        prices: {
          current: nowsPrices,
          changedFromLast: changedOrInitialPrices,
        },
      };
    }),
    itTap(({ prices }) => console.log('changedFromLast', Object.keys(prices.changedFromLast))),
    myIterableCleanupPatcher(source =>
      itLazyDefer(async function* () {
        // For each newly-obtained iterator, the following first yields all requested symbols' current prices once, and from then on, yield only the set of changed symbol prices;
        const iterator = source[Symbol.asyncIterator]();
        yield* asyncConcat(
          pipe(
            { [Symbol.asyncIterator]: () => ({ next: () => iterator.next() }) },
            asyncTake(1),
            asyncMap(({ prices }) => prices.current)
          ),
          pipe(
            { [Symbol.asyncIterator]: () => iterator },
            asyncMap(({ prices }) => prices.changedFromLast),
            asyncFilter(changedPrices => !isEmpty(changedPrices))
          )
        );
      })
    )
    // source => ({
    //   [Symbol.asyncIterator]: () => {
    //     let it: AsyncIterator<any>;
    //     return {
    //       async next() {
    //         it ??= source[Symbol.asyncIterator]();
    //         const next = await it.next();
    //         return next;
    //       },
    //       async return() {
    //         const returnPromise =
    //           it?.return?.() ?? ({ done: true as const, value: undefined } as any);
    //         const returnValue = await returnPromise;
    //         return returnValue;
    //       },
    //     };
    //   },
    // })
  );
}

// (async () => {
//   const iter = pipe(
//     (async function* () {
//       try {
//         while (true) {
//           yield new Date().toISOString();
//           await new Promise(resolve => setTimeout(resolve, 1000));
//         }
//       } finally {
//         console.log('DONE');
//       }
//     })(),
//     publish()
//   );

//   const iterator1 = iter[Symbol.asyncIterator]();

//   console.log(await iterator1.next());
//   console.log(await iterator1.next());

//   await Promise.all([iterator1.return!()]);
// })();

// function myIterableCleanupPatcher2(iterable, fn) {
//   let iterator;

//   const wrappedIterable = (async function* () {
//     iterator = iterable[Symbol.asyncIterator]();
//     let resolve;

//     try {
//       while (true) {
//         await new Promise((res, rej) => {
//           resolve = res;
//           iterator.next().then(resolve).catch(rej);
//         });
//         if (item.done) {
//           break;
//         }
//         yield item.value;
//       }
//     } finally {
//       await iterator.return?.();
//     }
//   })();

//   const originalReturn = wrappedIterable.return;

//   wrappedIterable.return = function () {
//     originalReturn.call(this);
//     console.log('originalReturn CALLED');
//     return iterator.return();
//   };

//   return fn(s);
// }

// function myIterableCleanupPatcher3(iterable, fn) {
//   const iterator = iterable[Symbol.asyncIterator]();
//   let lastEmittedPromiseResolve;

//   const wrapperIterable = {
//     [Symbol.asyncIterator]: () => ({
//       // ___: '___',
//       next() {
//         return new Promise((resolve, reject) => {
//           lastEmittedPromiseResolve = resolve;
//           iterator.next().then(resolve).catch(reject);
//         });
//       },
//       return() {
//         lastEmittedPromiseResolve?.({ done: true, value: undefined });
//         this.next = () => ({ done: true, value: undefined });
//         return iterator.return();
//       },
//     }),
//   };

//   return fn(wrapperIterable);
// }

// function myAsyncFilter(predicate) {
//   return sourceIter => {
//     let wasClosed = false;

//     const outputIter = (async function* () {
//       for await (const item of sourceIter) {
//         if (await predicate(item)) {
//           yield item;
//         }
//         console.log({ wasClosed });
//         if (wasClosed) {
//           break;
//         }
//       }
//     })();

//     const originalReturn = outputIter.return;

//     outputIter.return = function () {
//       wasClosed = true;
//       return originalReturn.call(this);
//     };

//     return outputIter;
//   };
// }
