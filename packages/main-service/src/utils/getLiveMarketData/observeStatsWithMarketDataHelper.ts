import { assign, compact, filter, keys, map, mapValues, pickBy } from 'lodash-es';
import { empty, of } from '@reactivex/ix-esnext-esm/asynciterable';
import { type DeepNonNullable } from 'utility-types';
import { CustomError, pipe } from 'shared-utils';
import {
  itMap,
  itMerge,
  itLazyDefer,
  itFilter,
  itShare,
  myIterableCleanupPatcher,
  type MaybeAsyncIterable,
} from 'iterable-operators';
import {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type StatsObjects,
  type StatsObjectChanges,
} from '../observeStatsObjectChanges/index.js';
import { type HoldingStats, type Lot } from '../positionsService/index.js';
import { marketDataService } from '../marketDataService/index.js';
import { type UpdatedSymbolPriceMap } from '../marketDataService/index.js';
import { isNotEmpty } from '../isNotEmpty.js';

export { observeStatsWithMarketDataHelper, type StatsObjectSpecifier, type HoldingStats, type Lot };

function observeStatsWithMarketDataHelper(params: {
  forStatsObjects: MaybeAsyncIterable<StatsObjectChanges> | StatsObjectSpecifier[];
  symbolExtractor:
    | ((
        statsObj: StatsObjects[
          | 'portfolioStatsChanges'
          | 'holdingStatsChanges'
          | 'lotChanges'][string]
      ) => string[] | undefined)
    | {
        translateToCurrencies?: string[];
        ignoreClosedObjectStats?: boolean;
        includeMarketDataFor?: {
          portfolios?: boolean;
          holdings?: boolean;
          lots?: boolean;
        };
      };
}): AsyncIterable<{
  currentStats: StatsObjectChanges['current'];
  changedStats: StatsObjectChanges['changes'];
  currentMarketData: DeepNonNullable<UpdatedSymbolPriceMap>;
}> {
  // TODO: Need to enhance logic such that empty holding stats and empty lots symbols are excluded from the price observations, and are only reported once in the initial message with their zero stats

  if (Array.isArray(params.forStatsObjects) && !params.forStatsObjects.length) {
    return empty();
  }

  const statsObjectsWithWatchedSymbolsIter = pipe(
    (() => {
      if (Array.isArray(params.forStatsObjects)) {
        return observeStatsObjectChanges({
          specifiers: params.forStatsObjects,
        });
      }
      if (!(Symbol.asyncIterator in params.forStatsObjects)) {
        return of(params.forStatsObjects);
      }
      return params.forStatsObjects;
    })(),
    itMap(({ current, changes }) => {
      let currentWithWatchedSymbols;

      if (typeof params.symbolExtractor === 'function') {
        const { symbolExtractor } = params;

        currentWithWatchedSymbols = {
          portfolioStats: mapValues(current.portfolioStats, p => ({
            obj: p,
            watchedSymbols: symbolExtractor(p) ?? [],
          })),
          holdingStats: mapValues(current.holdingStats, h => ({
            obj: h,
            watchedSymbols: symbolExtractor(h) ?? [],
          })),
          lots: mapValues(current.lots, l => ({
            obj: l,
            watchedSymbols: symbolExtractor(l) ?? [],
          })),
        };
      } else {
        const {
          ignoreClosedObjectStats = false,
          includeMarketDataFor,
          translateToCurrencies = [],
        } = params.symbolExtractor;

        currentWithWatchedSymbols = pipe(
          [current.portfolioStats, current.holdingStats, current.lots],
          ([portfolioStats, holdingStats, lots]) => {
            const [pStatsWithWatchedSymbols, hStatsWithWatchedSymbols, lotsWithWatchedSymbols] = [
              mapValues(portfolioStats, p => ({
                obj: p,
                watchedSymbols:
                  (ignoreClosedObjectStats && p.totalPresentInvestedAmount === 0) ||
                  !includeMarketDataFor?.portfolios
                    ? []
                    : [
                        ...p.resolvedHoldings.map(h => h.symbol),
                        ...pipe(
                          p.resolvedHoldings.map(h => h.symbolInfo.currency),
                          compact,
                          $ =>
                            $.flatMap(origCurrency =>
                              translateToCurrencies
                                .filter(transCurrency => transCurrency !== origCurrency)
                                .map(transCurrency => `${origCurrency}${transCurrency}=X`)
                            )
                        ),
                      ],
              })),

              mapValues(holdingStats, h => ({
                obj: h,
                watchedSymbols:
                  (ignoreClosedObjectStats && h.totalLotCount === 0) ||
                  !includeMarketDataFor?.holdings
                    ? []
                    : [
                        h.symbol,
                        ...(!h.symbolInfo.currency
                          ? []
                          : translateToCurrencies
                              .filter(transCurrency => transCurrency !== h.symbolInfo.currency)
                              .map(transCurrency => `${h.symbolInfo.currency}${transCurrency}=X`)),
                      ],
              })),

              mapValues(lots, l => ({
                obj: l,
                watchedSymbols:
                  (ignoreClosedObjectStats && l.remainingQuantity === 0) ||
                  !includeMarketDataFor?.lots
                    ? []
                    : [
                        l.symbol,
                        ...(!l.symbolInfo.currency
                          ? []
                          : translateToCurrencies
                              .filter(transCurrency => transCurrency !== l.symbolInfo.currency)
                              .map(transCurrency => `${l.symbolInfo.currency}${transCurrency}=X`)),
                      ],
              })),
            ];

            return {
              portfolioStats: pStatsWithWatchedSymbols,
              holdingStats: hStatsWithWatchedSymbols,
              lots: lotsWithWatchedSymbols,
            };
          }
        );
      }

      const changesWithWatchedSymbols = {
        portfolioStats: {
          remove: changes.portfolioStats.remove,
          set: changes.portfolioStats.set.map(p => ({
            obj: p,
            watchedSymbols:
              currentWithWatchedSymbols.portfolioStats[`${p.ownerId}_${p.forCurrency ?? ''}`]
                .watchedSymbols,
          })),
        },
        holdingStats: {
          remove: changes.holdingStats.remove,
          set: changes.holdingStats.set.map(h => ({
            obj: h,
            watchedSymbols:
              currentWithWatchedSymbols.holdingStats[`${h.ownerId}_${h.symbol}`].watchedSymbols,
          })),
        },
        lots: {
          remove: changes.lots.remove,
          set: changes.lots.set.map(l => ({
            obj: l,
            watchedSymbols: currentWithWatchedSymbols.lots[l.id].watchedSymbols,
          })),
        },
      };

      return {
        current: currentWithWatchedSymbols,
        changed: changesWithWatchedSymbols,
      };
    }),
    itShare()
  );

  const symbolMarketDataIter = pipe(
    statsObjectsWithWatchedSymbolsIter,
    itMap(({ current }) => {
      const symbols = [
        ...map(current.portfolioStats, p => p.watchedSymbols).flat(),
        ...map(current.holdingStats, h => h.watchedSymbols).flat(),
        ...map(current.lots, l => l.watchedSymbols).flat(),
      ];
      return symbols;
    }),
    $ => marketDataService.observeMarketData({ symbols: $ }),
    itMap(changedSymbols => {
      const symbolsNotFound = pipe(
        pickBy(changedSymbols, s => s === null),
        keys
      );

      if (symbolsNotFound.length) {
        throw new CustomError({
          type: 'SYMBOL_MARKET_DATA_NOT_FOUND',
          message: `Couldn't find market data for some symbols: ${symbolsNotFound.map(s => `"${s}"`).join(', ')}`,
          details: { symbolsNotFound },
        });
      }

      return changedSymbols as DeepNonNullable<UpdatedSymbolPriceMap>;
    }),
    $ =>
      itLazyDefer(() => {
        const allCurrentMarketData = {} as DeepNonNullable<UpdatedSymbolPriceMap>;
        return pipe(
          $,
          itMap(changedSymbols => {
            assign(allCurrentMarketData, changedSymbols);
            return {
              current: allCurrentMarketData,
              changed: changedSymbols,
            };
          })
        );
      })
  );

  return pipe(
    itMerge(
      pipe(
        statsObjectsWithWatchedSymbolsIter,
        itMap(statsCurrentAndChanged => ({
          stats: statsCurrentAndChanged,
          marketData: undefined,
        }))
      ),
      pipe(
        symbolMarketDataIter,
        itMap(marketDataCurrentAndChanged => ({
          stats: undefined,
          marketData: marketDataCurrentAndChanged,
        }))
      )
    ),
    myIterableCleanupPatcher(async function* (source) {
      const it = source[Symbol.asyncIterator]();

      let statsMostRecentValue;
      let marketDataMostRecentValue;

      do {
        const { done, value } = await it.next();
        if (done) {
          return;
        }
        if (value.stats) {
          statsMostRecentValue = value;
        } else {
          marketDataMostRecentValue = value;
        }
      } while (!statsMostRecentValue || !marketDataMostRecentValue);

      const current = {
        stats: statsMostRecentValue.stats.current,
        marketData: marketDataMostRecentValue.marketData.current,
      };

      yield {
        current,
        changed: { stats: statsMostRecentValue.stats.changed },
      };

      for await (const next of { [Symbol.asyncIterator]: () => it }) {
        if (next.stats) {
          current.stats = next.stats.current;
        } else {
          assign(current.marketData, next.marketData.changed);
        }
        yield {
          current,
          changed: next.stats
            ? { stats: next.stats.changed }
            : { marketData: next.marketData.changed },
        };
      }
    }),
    itMap(async ({ current, changed }) => {
      const [
        portfolioStatsToSetFiltered,
        holdingStatsToSetFiltered,
        lotsToSetFiltered,
        portfolioStatsToRemove,
        holdingStatsToRemove,
        lotsToRemove,
      ] = changed.stats
        ? [
            changed.stats.portfolioStats.set.filter(p =>
              p.watchedSymbols.every(s => s in current.marketData)
            ),
            changed.stats.holdingStats.set.filter(h =>
              h.watchedSymbols.every(s => s in current.marketData)
            ),
            changed.stats.lots.set.filter(l =>
              l.watchedSymbols.every(s => s in current.marketData)
            ),
            changed.stats.portfolioStats.remove,
            changed.stats.holdingStats.remove,
            changed.stats.lots.remove,
          ]
        : [
            filter(
              current.stats.portfolioStats,
              p =>
                p.watchedSymbols.some(s => s in changed.marketData) &&
                p.watchedSymbols.every(s => s in current.marketData)
            ),
            filter(
              current.stats.holdingStats,
              h =>
                h.watchedSymbols.some(s => s in changed.marketData) &&
                h.watchedSymbols.every(s => s in current.marketData)
            ),
            filter(
              current.stats.lots,
              l =>
                l.watchedSymbols.some(s => s in changed.marketData) &&
                l.watchedSymbols.every(s => s in current.marketData)
            ),
            [],
            [],
            [],
          ];

      return {
        currentStats: {
          portfolioStats: mapValues(current.stats.portfolioStats, p => p.obj),
          holdingStats: mapValues(current.stats.holdingStats, h => h.obj),
          lots: mapValues(current.stats.lots, l => l.obj),
        },
        changedStats: {
          portfolioStats: {
            remove: portfolioStatsToRemove,
            set: portfolioStatsToSetFiltered.map(p => p.obj),
          },
          holdingStats: {
            remove: holdingStatsToRemove,
            set: holdingStatsToSetFiltered.map(h => h.obj),
          },
          lots: {
            remove: lotsToRemove,
            set: lotsToSetFiltered.map(l => l.obj),
          },
        },
        currentMarketData: current.marketData,
      };
    }),
    itFilter(
      ({ changedStats }, i) =>
        i === 0 ||
        [
          changedStats.portfolioStats.remove,
          changedStats.portfolioStats.set,
          changedStats.holdingStats.remove,
          changedStats.holdingStats.set,
          changedStats.lots.remove,
          changedStats.lots.set,
        ].some(isNotEmpty)
    ),
    itShare()
  );
}
