import { pickBy, isEmpty, pick } from 'lodash-es';
import { asyncMap, asyncFilter, asyncTake, asyncConcat } from 'iter-tools';
import { of } from '@reactivex/ix-esnext-esm/asynciterable';
import DataLoader from 'dataloader';
import yahooFinance from 'yahoo-finance2';
import {
  itPairwise,
  itMap,
  itTap,
  itLazyDefer,
  myIterableCleanupPatcher,
  itSwitchMap,
  itCatch,
  itThrottle,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import { pipe, objectFromEntriesTyped, parseSymbol, asyncPipe } from 'shared-utils';
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
    itMap(symbols => symbols.map(parseSymbol)),
    symbolsIter =>
      itLazyDefer(() => {
        let currSymbolFetchersBySymbol: {
          [symbol: string]: AsyncIterator<SymbolPriceData>;
        } = {};

        let abortCtrl = new AbortController();

        const marketDataLoader = new DataLoader<string, SymbolPriceData>(async symbols => {
          marketDataLoader.clearAll();
          return pipe(
            await getSymbolsCurrentPrices({
              signal: abortCtrl.signal,
              symbols: symbols as string[],
            }),
            symbolMarketDatas => symbols.map(symbol => symbolMarketDatas[symbol])
          );
        });

        return pipe(
          symbolsIter,
          itSwitchMap(currAskedSymbols => {
            if (currAskedSymbols.length === 0) {
              abortCtrl.abort();
              abortCtrl = new AbortController();
              return (async function* () {})();
            }

            return pipe(
              itLazyDefer(async () => {
                currSymbolFetchersBySymbol = pick(
                  currSymbolFetchersBySymbol,
                  currAskedSymbols.map(s => s.normalizedFullSymbol)
                );

                const symbolsToAddFetchersFor = currAskedSymbols.filter(
                  s => !currSymbolFetchersBySymbol[s.normalizedFullSymbol]
                );

                const additionalSymbolFetcherInits = await Promise.all(
                  symbolsToAddFetchersFor.map(async function initSymbolFetcher(s): Promise<{
                    symbol: string;
                    iterator: AsyncIterator<SymbolPriceData, void, void>;
                  }> {
                    const mktDataIteratorForSymbol = await (async () => {
                      const matchForCurrencyExFormat =
                        s.baseInstrumentSymbol.match(yahooCurrencyExFormatRe);

                      if (matchForCurrencyExFormat) {
                        const initialMktData = await marketDataLoader.load(
                          `${s.baseInstrumentSymbol}`
                        );

                        if (initialMktData) {
                          return (async function* () {
                            yield initialMktData;
                            while (true) {
                              yield await marketDataLoader.load(`${s.baseInstrumentSymbol}`);
                            }
                          })();
                        }

                        const [, origCurrency, targetCurrency] = matchForCurrencyExFormat;

                        if (origCurrency === targetCurrency) {
                          return (async function* () {
                            while (true) {
                              yield {
                                quoteSourceName: undefined,
                                currency: undefined,
                                marketState: undefined,
                                regularMarketTime: undefined,
                                regularMarketPrice: 1,
                              };
                            }
                          })();
                        }

                        return (async function* () {
                          while (true) {
                            const [origToCommonExData, commonToTargetExData] = await Promise.all([
                              marketDataLoader.load(`${origCurrency}USD=X`),
                              marketDataLoader.load(`USD${targetCurrency}=X`),
                            ]);

                            if (
                              !origToCommonExData?.regularMarketPrice ||
                              !commonToTargetExData?.regularMarketPrice
                            ) {
                              break;
                            }

                            yield {
                              quoteSourceName: commonToTargetExData.quoteSourceName,
                              marketState: commonToTargetExData.marketState,
                              currency: targetCurrency,
                              regularMarketTime: pipe(
                                Math.max(
                                  origToCommonExData.regularMarketTime?.getTime() ?? 0,
                                  commonToTargetExData.regularMarketTime?.getTime() ?? 0
                                ),
                                time => (time === 0 ? undefined : new Date(time))
                              ),
                              regularMarketPrice:
                                origToCommonExData.regularMarketPrice *
                                commonToTargetExData.regularMarketPrice,
                            };
                          }
                        })();
                      }

                      const initialMktData = await marketDataLoader.load(s.baseInstrumentSymbol);

                      if (!initialMktData) {
                        return (async function* () {})();
                      }

                      if (
                        !(
                          initialMktData.currency &&
                          s.currencyOverride &&
                          initialMktData.currency !== s.currencyOverride
                        )
                      ) {
                        return (async function* () {
                          while (true) {
                            yield await marketDataLoader.load(`${s.baseInstrumentSymbol}`);
                          }
                        })();
                      }

                      const overrideCurrencyFetcherIterator = (
                        await initSymbolFetcher(
                          parseSymbol(`${initialMktData.currency}${s.currencyOverride}=X`)
                        )
                      ).iterator;

                      return (async function* () {
                        while (true) {
                          const [instrumentMktData, conversionRate] = await Promise.all([
                            marketDataLoader.load(`${s.baseInstrumentSymbol}`),
                            (async () => {
                              const next = await overrideCurrencyFetcherIterator.next();
                              return next.value?.regularMarketPrice;
                            })(),
                          ]);

                          if (!instrumentMktData?.regularMarketPrice || !conversionRate) {
                            break;
                          }

                          yield {
                            ...instrumentMktData,
                            currency: s.currencyOverride,
                            regularMarketPrice:
                              instrumentMktData.regularMarketPrice * conversionRate,
                          };
                        }
                      })();
                    })();

                    return {
                      symbol: s.normalizedFullSymbol,
                      iterator: mktDataIteratorForSymbol,
                    };
                  })
                );

                for (const f of additionalSymbolFetcherInits) {
                  currSymbolFetchersBySymbol[f.symbol] = f.iterator;
                }

                return pipe(
                  (async function* () {
                    while (true) yield;
                  })()
                );
              })
            );
          }),
          itMap(() =>
            asyncPipe(
              currSymbolFetchersBySymbol,
              $ => Object.entries($),
              $ =>
                $.map(async ([symbol, iterator]) => {
                  const next = await iterator.next();
                  const mktData = next.done ? null : next.value;
                  return [symbol, mktData] as [string, SymbolPriceData];
                }),
              $ => Promise.all($),
              objectFromEntriesTyped
            )
          ),
          itCatch(err => {
            if (abortCtrl.signal.aborted) {
              return (async function* () {})();
            }
            throw err;
          })
        );
      }),
    itThrottle(env.SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS),
    itPairwise({} as SymbolPrices),
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
    ),
    itTap(changes => console.log('changedFromLast', Object.keys(changes)))
  );
}

const yahooCurrencyExFormatRe = /([A-Z]{3})([A-Z]{3})=X$/;
