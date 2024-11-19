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
  type ExtractAsyncIterableValue,
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
            return { current: allCurrentMarketData, changed: changedSymbols };
          })
        );
      })
  );

  return pipe(
    itLazyDefer(() => {
      const current = {
        stats: {
          portfolioStats: {},
          holdingStats: {},
          lots: {},
        } as ExtractAsyncIterableValue<typeof statsObjectsWithWatchedSymbolsIter>['current'],

        marketData: {} as DeepNonNullable<UpdatedSymbolPriceMap>,
      };

      return itMerge(
        pipe(
          statsObjectsWithWatchedSymbolsIter,
          itMap(statsCurrentAndChanged => {
            current.stats = statsCurrentAndChanged.current;
            return {
              current,
              changed: {
                stats: statsCurrentAndChanged.changed,
                marketData: undefined,
              },
            };
          })
        ),
        pipe(
          symbolMarketDataIter,
          itMap(marketDataCurrentAndChanged => {
            current.marketData = marketDataCurrentAndChanged.current;
            return {
              current,
              changed: {
                stats: undefined,
                marketData: marketDataCurrentAndChanged.changed,
              },
            };
          })
        )
      );
    }),
    myIterableCleanupPatcher(async function* (source) {
      let statsChangesPendingMatchingMarketData;

      for await (const { current, changed } of source) {
        if (changed.stats) {
          statsChangesPendingMatchingMarketData = changed.stats;
        }

        if (statsChangesPendingMatchingMarketData) {
          if (
            [
              statsChangesPendingMatchingMarketData.portfolioStats.set,
              statsChangesPendingMatchingMarketData.holdingStats.set,
              statsChangesPendingMatchingMarketData.lots.set,
            ]
              .flat()
              .flatMap(item => item.watchedSymbols)
              .every(s => s in current.marketData)
          ) {
            yield {
              current,
              changed: {
                stats: statsChangesPendingMatchingMarketData,
              },
            };
            statsChangesPendingMatchingMarketData = undefined;
          }
        } else if (changed.marketData) {
          const [portfolioStatsToSetFiltered, holdingStatsToSetFiltered, lotsToSetFiltered] = [
            filter(current.stats.portfolioStats, p =>
              p.watchedSymbols.some(sym => sym in changed.marketData)
            ),
            filter(current.stats.holdingStats, h =>
              h.watchedSymbols.some(sym => sym in changed.marketData)
            ),
            filter(current.stats.lots, l =>
              l.watchedSymbols.some(sym => sym in changed.marketData)
            ),
          ];

          yield {
            current,
            changed: {
              stats: {
                portfolioStats: { remove: [], set: portfolioStatsToSetFiltered },
                holdingStats: { remove: [], set: holdingStatsToSetFiltered },
                lots: { remove: [], set: lotsToSetFiltered },
              },
            },
          };
        }
      }
    }),
    itMap(({ current, changed }) => ({
      currentStats: {
        portfolioStats: mapValues(current.stats.portfolioStats, p => p.obj),
        holdingStats: mapValues(current.stats.holdingStats, h => h.obj),
        lots: mapValues(current.stats.lots, l => l.obj),
      },
      changedStats: {
        portfolioStats: {
          remove: changed.stats.portfolioStats.remove,
          set: changed.stats.portfolioStats.set.map(p => p.obj),
        },
        holdingStats: {
          remove: changed.stats.holdingStats.remove,
          set: changed.stats.holdingStats.set.map(h => h.obj),
        },
        lots: {
          remove: changed.stats.lots.remove,
          set: changed.stats.lots.set.map(l => l.obj),
        },
      },
      currentMarketData: current.marketData,
    })),
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
