import { assign, compact, identity, filter, isEqual } from 'lodash';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import {
  itMap,
  itFilter,
  itMerge,
  itLazyDefer,
  itShare,
  itPairwise,
  itStartWith,
  itTakeFirst,
} from 'iterable-operators';
import {
  marketDataService,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from '../marketDataService/index.js';
import {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type StatsObjects,
  type StatsObjectChanges2,
} from '../observeStatsObjectChanges/index.js';
import { type HoldingStats, type Position } from '../positionsService/index.js';
import { normalizeFloatImprecisions } from '../normalizeFloatImprecisions.js';
// import { from, AsyncSink } from '@reactivex/ix-esnext-esm/asynciterable';
// import { switchMap } from '@reactivex/ix-esnext-esm/asynciterable/operators/switchmap';

export {
  getLiveMarketData,
  type StatsObjectSpecifier,
  type MarketDataUpdate,
  type PortfolioMarketStatsUpdate,
  type HoldingMarketStatsUpdate,
  type HoldingStats,
  type PositionMarketStatsUpdate,
  type Position,
  type InstrumentMarketPriceInfo,
  type PnlInfo,
};

// TODO: `combineLatest` from '@reactivex/ix-esnext-esm/asynciterable' becomes stuck indefinitely whenever any of its input iterables finishes empty of values - contribute to working this out through the public repo?

function getLiveMarketData<
  TTranslateCurrencies extends string,
  TWithPriceData extends boolean | undefined = false,
  TWithPnl extends boolean | undefined = false,
>(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: TTranslateCurrencies[];
  include?: {
    priceData?: TWithPriceData;
    unrealizedPnl?: TWithPnl;
  };
}): AsyncIterable<
  MarketDataUpdate<
    TWithPriceData extends true ? true : false,
    TWithPnl extends true ? true : false,
    TTranslateCurrencies
  >
>;
function getLiveMarketData(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: string[];
  include?: {
    priceData?: boolean;
    unrealizedPnl?: boolean;
  };
}): AsyncIterable<MarketDataUpdate<boolean, boolean, string>> {
  // TODO: Need to enhance logic such that empty holding stats and empty positions symbols are excluded from the price observations, and are only reported once in the initial message with their zero stats

  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
    include: {
      priceData: params.include?.priceData ?? false,
      unrealizedPnl: params.include?.unrealizedPnl ?? false,
    },
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const observedStatsObjectsIter = observeStatsObjectChanges({
    specifiers: paramsNorm.specifiers,
  });

  const symbolPriceDataIter =
    !paramsNorm.include.unrealizedPnl && !paramsNorm.include.priceData
      ? (async function* () {})()
      : pipe(
          observedStatsObjectsIter,
          itMap(({ changes, current }) => ({
            // TODO: Handle also the `.remove` changes throughout this iterable rather then only the `.set` ones
            // portfolioStatsChanges: changes.portfolioStats.set,
            // holdingStatsChanges: changes.holdingStats.set,
            // positionChanges: changes.positions.set,
            portfolioStatsChanges: Object.values(current.portfolioStats),
            holdingStatsChanges: Object.values(current.holdingStats),
            positionChanges: Object.values(current.positions),
          })),
          paramsNorm.include.priceData
            ? identity
            : itMap(({ portfolioStatsChanges, holdingStatsChanges, positionChanges }) => {
                const nonEmptyPortfolioStatsChanges = portfolioStatsChanges.filter(
                  ({ totalPresentInvestedAmount }) => totalPresentInvestedAmount > 0
                );
                const nonEmptyHoldingStatsChanges = holdingStatsChanges.filter(
                  ({ totalPositionCount }) => totalPositionCount > 0
                );
                const nonClosedPositions = positionChanges.filter(
                  ({ remainingQuantity }) => remainingQuantity > 0
                );
                return {
                  portfolioStatsChanges: nonEmptyPortfolioStatsChanges,
                  holdingStatsChanges: nonEmptyHoldingStatsChanges,
                  positionChanges: nonClosedPositions,
                };
              }),
          itMap(({ portfolioStatsChanges, holdingStatsChanges, positionChanges }) => {
            const targetSymbols = [
              ...portfolioStatsChanges
                .flatMap(p => p.resolvedHoldings)
                .map(resolvedHolding => resolvedHolding.symbol),
              ...holdingStatsChanges.map(h => h.symbol),
              ...positionChanges.map(p => p.symbol),
            ];

            const translateCurrenciesExchangeSymbols = pipe(
              [
                ...portfolioStatsChanges.map(p => p.forCurrency),
                ...holdingStatsChanges.map(h => h.symbolInfo.currency),
                ...positionChanges.map(p => p.symbolInfo.currency),
              ],
              compact,
              v =>
                v.flatMap(posCurrency =>
                  paramsNorm.translateToCurrencies.map(
                    translateCurrency => `${posCurrency}${translateCurrency}=X`
                  )
                )
            );

            return [...targetSymbols, ...translateCurrenciesExchangeSymbols].toSorted();
          }),
          itStartWith([] as string[]),
          itPairwise(),
          // itFilter(([prev, next], i) => i === 0 || difference(next, prev).length > 0),
          itFilter(([prev, next], i) => i === 0 || !isEqual(prev, next)),
          // itFilter(([prev, next], i) => {
          //   console.log({ prev, next });
          //   return i === 0 || difference(next, prev).length > 0 || difference(prev, next).length > 0;
          // }),
          itMap(([, nextChangedSymbols]) => nextChangedSymbols),
          // itMap(nextChangedSymbols => {
          //   console.log('nextChangedSymbols', nextChangedSymbols);
          //   return nextChangedSymbols;
          // }),
          symbolsIter => marketDataService.observeMarketData({ symbols: symbolsIter })
        );

  return pipe(
    itMerge(
      pipe(
        observedStatsObjectsIter,
        itMap(({ current, changes }) => ({
          currentStats: current,
          changedStats: changes,
          changedSymbols: undefined,
        }))
      ),
      pipe(
        symbolPriceDataIter,
        itMap(changedSymbols => ({
          currentStats: undefined,
          changedStats: undefined,
          changedSymbols,
        }))
      )
    ),
    // myIterableCleanupPatcher(async function* (statsOrPriceDataChangeIter) {
    //   const initialLoadOfSymbolPricesPromise = (async () => {
    //     const changedSymbols = await pipe(symbolPriceDataIter, itTakeFirst());
    //     return changedSymbols;
    //   })();
    //   for await (const nextValue of statsOrPriceDataChangeIter) {
    //     yield nextValue;
    //   }
    // }),
    statsOrPriceDataChangeIter =>
      itLazyDefer(() => {
        let allCurrStats: StatsObjectChanges2['current'] = {
          portfolioStats: Object.create(null),
          holdingStats: Object.create(null),
          positions: Object.create(null),
        };
        const allCurrSymbolPriceData = Object.create(null) as UpdatedSymbolPriceMap;

        const initialLoadOfSymbolPricesPromise = (async () => {
          const changedSymbols = await pipe(symbolPriceDataIter, itTakeFirst());
          assign(allCurrSymbolPriceData, changedSymbols);
        })();

        return pipe(
          statsOrPriceDataChangeIter,
          itMap(async ({ currentStats, changedStats, changedSymbols }) => {
            if (changedSymbols) {
              assign(allCurrSymbolPriceData, changedSymbols);

              return {
                portfolioStats: {
                  remove: [],
                  set: filter(allCurrStats.portfolioStats, ({ resolvedHoldings }) =>
                    resolvedHoldings.some(
                      h => h.totalPositionCount > 0 && !!changedSymbols[h.symbol]
                    )
                  ),
                },
                holdingStats: {
                  remove: [],
                  set: filter(allCurrStats.holdingStats, h => !!changedSymbols[h.symbol]),
                },
                positions: {
                  remove: [],
                  set: filter(allCurrStats.positions, p => !!changedSymbols[p.symbol]),
                },
              };
            } else {
              await initialLoadOfSymbolPricesPromise;

              allCurrStats = currentStats;

              return !paramsNorm.include.unrealizedPnl && !paramsNorm.include.priceData
                ? changedStats
                : {
                    portfolioStats: {
                      remove: changedStats.portfolioStats.remove,
                      set: changedStats.portfolioStats.set.filter(p =>
                        p.resolvedHoldings.every(
                          h => h.totalPositionCount === 0 || h.symbol in allCurrSymbolPriceData
                        )
                      ),
                    },
                    holdingStats: {
                      remove: changedStats.holdingStats.remove,
                      set: changedStats.holdingStats.set.filter(
                        paramsNorm.include.priceData
                          ? h => h.symbol in allCurrSymbolPriceData
                          : h => h.totalPositionCount === 0 || h.symbol in allCurrSymbolPriceData
                      ),
                    },
                    positions: {
                      remove: changedStats.positions.remove,
                      set: changedStats.positions.set.filter(
                        paramsNorm.include.priceData
                          ? pos => pos.symbol in allCurrSymbolPriceData
                          : pos =>
                              pos.remainingQuantity === 0 || pos.symbol in allCurrSymbolPriceData
                      ),
                    },
                  };
            }
          }),
          itFilter(
            ({ portfolioStats, holdingStats, positions }, i) =>
              i === 0 ||
              !!portfolioStats.set.length ||
              !!portfolioStats.remove.length ||
              !!holdingStats.set.length ||
              !!holdingStats.remove.length ||
              !!positions.set.length ||
              !!positions.remove.length
          ),
          itMap(changes => {
            // TODO: Need to refactor all calculations that follow to be decimal-accurate (with `pnpm add decimal.js-light`)

            const portfolioUpdates = (
              [
                [{ type: 'SET' }, changes.portfolioStats.set],
                [{ type: 'REMOVE' }, changes.portfolioStats.remove],
              ] as const
            ).flatMap(([{ type }, changed]) =>
              changed.map(pStats => {
                const pnl = !paramsNorm.include.unrealizedPnl
                  ? undefined
                  : (() => {
                      const { pnlAmount, pnlPercent } = portfolioStatsCalcPnl(
                        pStats,
                        allCurrSymbolPriceData
                      );

                      const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                        pStats.forCurrency,
                        paramsNorm.translateToCurrencies,
                        pnlAmount,
                        allCurrSymbolPriceData
                      );

                      return {
                        amount: normalizeFloatImprecisions(pnlAmount),
                        percent: normalizeFloatImprecisions(pnlPercent),
                        byTranslateCurrencies: pnlByTranslateCurrencies,
                      };
                    })();

                return {
                  type,
                  portfolio: pStats,
                  pnl,
                };
              })
            );

            const holdingUpdates = (
              [
                [{ type: 'SET' }, changes.holdingStats.set],
                [{ type: 'REMOVE' }, changes.holdingStats.remove],
              ] as const
            ).flatMap(([{ type }, changed]) =>
              changed.map(holding => {
                const priceUpdateForSymbol = allCurrSymbolPriceData[holding.symbol];

                const priceData = !paramsNorm.include.priceData
                  ? undefined
                  : {
                      marketState: priceUpdateForSymbol.marketState,
                      currency: priceUpdateForSymbol.currency,
                      regularMarketTime: priceUpdateForSymbol.regularMarketTime,
                      regularMarketPrice: priceUpdateForSymbol.regularMarketPrice,
                    };

                const pnl = !paramsNorm.include.unrealizedPnl
                  ? undefined
                  : (() => {
                      const { amount: pnlAmount, percent: pnlPercent } = calcHoldingRevenue({
                        holding,
                        priceInfo: priceUpdateForSymbol,
                      });

                      const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                        holding.symbolInfo.currency,
                        paramsNorm.translateToCurrencies,
                        pnlAmount,
                        allCurrSymbolPriceData
                      );

                      return {
                        amount: normalizeFloatImprecisions(pnlAmount),
                        percent: normalizeFloatImprecisions(pnlPercent),
                        byTranslateCurrencies: pnlByTranslateCurrencies,
                      };
                    })();

                return { type, holding, priceData, pnl };
              })
            );

            const positionUpdates = (
              [
                [{ type: 'SET' }, changes.positions.set],
                [{ type: 'REMOVE' }, changes.positions.remove],
              ] as const
            ).flatMap(([{ type }, changed]) =>
              changed.map(pos => {
                const priceUpdateForSymbol = allCurrSymbolPriceData[pos.symbol];

                const priceData = !paramsNorm.include.priceData
                  ? undefined
                  : {
                      currency: priceUpdateForSymbol.currency,
                      marketState: priceUpdateForSymbol.marketState,
                      regularMarketTime: priceUpdateForSymbol.regularMarketTime,
                      regularMarketPrice: priceUpdateForSymbol.regularMarketPrice,
                    };

                const pnl = !paramsNorm.include.unrealizedPnl
                  ? undefined
                  : (() => {
                      const [pnlAmount, pnlPercent] =
                        pos.remainingQuantity === 0
                          ? [0, 0]
                          : [
                              pos.remainingQuantity *
                                (priceUpdateForSymbol.regularMarketPrice - pos.openingTrade.price),

                              (priceUpdateForSymbol.regularMarketPrice / pos.openingTrade.price -
                                1) *
                                100,
                            ];

                      const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                        pos.symbolInfo.currency,
                        paramsNorm.translateToCurrencies,
                        pnlAmount,
                        allCurrSymbolPriceData
                      );

                      return {
                        amount: normalizeFloatImprecisions(pnlAmount),
                        percent: normalizeFloatImprecisions(pnlPercent),
                        byTranslateCurrencies: pnlByTranslateCurrencies,
                      };
                    })();

                return { type, position: pos, priceData, pnl };
              })
            );

            return {
              portfolios: portfolioUpdates,
              holdings: holdingUpdates,
              positions: positionUpdates,
            };
          })
        );
      }),
    itShare()
  );
}

function portfolioStatsCalcPnl(
  portfolioStats: {
    totalPresentInvestedAmount: number;
    resolvedHoldings: {
      symbol: string;
      breakEvenPrice: number | null;
      totalQuantity: number;
      totalPresentInvestedAmount: number;
    }[];
  },
  instrumentMarketData: UpdatedSymbolPriceMap
): {
  pnlAmount: number;
  pnlPercent: number;
} {
  const nonEmptyResolvedHoldings = portfolioStats.resolvedHoldings.filter(
    (holding): holding is typeof holding & { breakEvenPrice: number } => !!holding.breakEvenPrice
  );

  const pnlAmount = nonEmptyResolvedHoldings
    .map(
      h => (instrumentMarketData[h.symbol].regularMarketPrice - h.breakEvenPrice) * h.totalQuantity
    )
    .reduce((acc, holdingPnlAmount) => acc + holdingPnlAmount, 0);

  const pnlPercent =
    nonEmptyResolvedHoldings.reduce(
      (acc, holding) =>
        acc +
        (instrumentMarketData[holding.symbol].regularMarketPrice / holding.breakEvenPrice - 1) *
          (holding.totalPresentInvestedAmount / portfolioStats.totalPresentInvestedAmount),
      0
    ) * 100;

  return { pnlAmount, pnlPercent };
}

function calcHoldingRevenue(input: { holding: HoldingStats; priceInfo: UpdatedSymbolPrice }): {
  percent: number;
  amount: number;
} {
  const { holding, priceInfo } = input;

  if (holding.breakEvenPrice === null) {
    return { amount: 0, percent: 0 };
  }

  // const breakEvenPrice = new Decimal(holding.totalPresentInvestedAmount).div(holding.totalQuantity);

  // const amount = new Decimal(priceInfo.regularMarketPrice)
  //   .minus(breakEvenPrice)
  //   .times(holding.totalQuantity)
  //   .toNumber();
  // const percent = new Decimal(priceInfo.regularMarketPrice)
  //   .div(breakEvenPrice)
  //   .minus(1)
  //   .times(100)
  //   .toNumber();

  const amount = (priceInfo.regularMarketPrice - holding.breakEvenPrice) * holding.totalQuantity;
  const percent = (priceInfo.regularMarketPrice / holding.breakEvenPrice - 1) * 100;

  return { amount, percent };
}

function calcPnlInTranslateCurrencies<TTranslateCurrencies extends string = string>(
  originCurrency: string | null | undefined,
  translateCurrencies: TTranslateCurrencies[],
  pnlAmountOriginCurrency: number,
  symbolPriceDatas: UpdatedSymbolPriceMap
): {
  currency: TTranslateCurrencies;
  exchangeRate: number;
  amount: number;
}[] {
  return pipe(
    translateCurrencies.map(translateCurrency => {
      if (!originCurrency) {
        return;
      }

      const exchangeSymbol = `${originCurrency}${translateCurrency}=X`;
      const exchangeRate = symbolPriceDatas[exchangeSymbol]?.regularMarketPrice;

      if (!exchangeRate) {
        return;
      }

      return {
        currency: translateCurrency,
        exchangeRate: exchangeRate,
        amount: pnlAmountOriginCurrency * exchangeRate,
      };
    }),
    compact
  );
}

type MarketDataUpdate<
  TWithPriceData extends boolean = false,
  TWithPnl extends boolean = false,
  TTranslateCurrencies extends string = string,
> = {
  portfolios: PortfolioMarketStatsUpdate<
    TWithPnl extends true ? true : false,
    TTranslateCurrencies
  >[];
  holdings: HoldingMarketStatsUpdate<
    TWithPriceData extends true ? true : false,
    TWithPnl extends true ? true : false,
    TTranslateCurrencies
  >[];
  positions: PositionMarketStatsUpdate<
    TWithPriceData extends true ? true : false,
    TWithPnl extends true ? true : false,
    TTranslateCurrencies
  >[];
};

type PortfolioMarketStatsUpdate<
  TWithPnl extends boolean = false,
  TTranslateCurrencies extends string = string,
> = {
  type: 'SET' | 'REMOVE';
  portfolio: StatsObjects['portfolioStatsChanges'][string];
  pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined;
};

type HoldingMarketStatsUpdate<
  TWithPriceData extends boolean = false,
  TWithPnl extends boolean = false,
  TTranslateCurrencies extends string = string,
> = {
  type: 'SET' | 'REMOVE';
  holding: HoldingStats;
  priceData: TWithPriceData extends true ? InstrumentMarketPriceInfo : undefined;
  pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined;
};

type PositionMarketStatsUpdate<
  TWithPriceData extends boolean = false,
  TWithPnl extends boolean = false,
  TTranslateCurrencies extends string = string,
> = {
  type: 'SET' | 'REMOVE';
  position: Position;
  priceData: TWithPriceData extends true ? InstrumentMarketPriceInfo : undefined;
  pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined;
};

type InstrumentMarketPriceInfo = Pick<
  UpdatedSymbolPrice,
  'marketState' | 'currency' | 'regularMarketTime' | 'regularMarketPrice'
>;

type PnlInfo<TTranslateCurrencies extends string> = {
  percent: number;
  amount: number;
  byTranslateCurrencies: {
    currency: TTranslateCurrencies;
    exchangeRate: number;
    amount: number;
  }[];
};

// (async () => {
//   const userId = '7eeae30b-4e5d-45aa-ad75-5bee1cb9cca6';
//   const iter = pipe(
//     getLiveMarketData({
//       specifiers: [
//         // { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: undefined },
//         // { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'AAPL' },

//         { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'ADBE' },
//         { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'AAPL' },
//         { type: 'POSITION', positionId: 'c235e17f-b3e4-4051-8b9b-07b98126664d' },
//         { type: 'POSITION', positionId: '95795a49-9561-4494-ba17-3809f33af0a7' },
//       ],
//       // translateToCurrencies: ['ILS', 'GBP'],
//     }),
//     itTakeUntil(() => new Promise(resolve => setTimeout(resolve, 4000)))
//   );

//   for await (const updates of iter) {
//     console.log('updates'.toUpperCase(), JSON.stringify(updates, undefined, 2));
//   }
// })();

// (async () => {
//   const iterable = itCombineLatest(
//     getPortfolioLiveMarketData({
//       specifiers: [{ ownerId: '7eeae30b-4e5d-45aa-ad75-5bee1cb9cca6', currency: 'USD' }],
//     })
//   );

//   for await (const [portfolioUpdates] of iterable) {
//     console.log('portfolioUpdates:', portfolioUpdates);
//   }
// })();

// (async () => {
//   const iter = pipe(
//     from({
//       [Symbol.asyncIterator]() {
//         const sink = new AsyncSink<undefined>();
//         const intervalId = setInterval(() => sink.write(undefined),  000);

//         return {
//           next: async () => sink.next(),
//           return: async () => {
//             console.log('SOURCE GOT CLOSED OFF');
//             clearInterval(intervalId);
//             return { done: true, value: undefined };
//           },
//         };
//       },
//     }),
//     // from(
//     //   (async function* () {
//     //     try {
//     //       yield 'a';
//     //       await new Promise(resolve => setTimeout(resolve, 5000));
//     //       yield 'b';
//     //     } finally {
//     //       console.log('SOURCE FINALLY');
//     //     }
//     //   })()
//     // ),
//     iter => ({
//       [Symbol.asyncIterator]() {
//         const iterator = iter[Symbol.asyncIterator]();
//         return {
//           next: () => {
//             return iterator.next();
//           },
//           return: () => {
//             return iterator.return!();
//           },
//         };
//       },
//     }),
//     switchMap(async function* (item) {
//       // throw new Error('LOL');
//       yield* [item, item, item];
//     })
//   );

//   try {
//     for await (const item of iter) {
//       console.log('ITEM', item);
//       // break;
//     }
//     console.log('DONE');
//   } catch (err) {
//     console.error('ERROR', err);
//   }
// })();
