import { assign, filter, isEqual, values } from 'lodash-es';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { type DeepNonNullable, type DeepPartial } from 'utility-types';
import { pipe } from 'shared-utils';
import { itMap, itFilter, itMerge, itLazyDefer, itShare, itTakeFirst } from 'iterable-operators';
import {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type StatsObjects,
  type StatsObjectChanges,
} from '../observeStatsObjectChanges/index.js';
import { type HoldingStats, type Lot } from '../positionsService/index.js';
import { normalizeFloatImprecisions } from '../normalizeFloatImprecisions.js';
import { objectCreateNullProto } from '../objectCreateNullProto.js';
import {
  getMarketDataByStatsObjectsIter,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from './getMarketDataByStatsObjectsIter.js';
// import { type AllLeafPropsIntoBools } from './AllLeafPropsIntoBools.js';
import { portfolioStatsCalcMarketStats } from './portfolioStatsCalcMarketStats.js';
import { calcPnlInTranslateCurrencies } from './calcPnlInTranslateCurrencies.js';
import { calcHoldingRevenue } from './calcHoldingRevenue.js';
import { deepObjectPickFields, type DeepObjectFieldsPicked } from './deepObjectPickFields.js';

export {
  getLiveMarketData,
  type StatsObjectSpecifier,
  type MarketDataUpdate,
  type PortfolioMarketStatsUpdate,
  type HoldingMarketStatsUpdate,
  type HoldingStats,
  type LotMarketStatsUpdate,
  type Lot,
  type InstrumentMarketPriceInfo,
  type PnlInfo,
};

// TODO: `combineLatest` from '@reactivex/ix-esnext-esm/asynciterable' becomes stuck indefinitely whenever any of its input iterables finishes empty of values - contribute to working this out through the public repo?

function getLiveMarketData<
  TTranslateCurrencies extends string,
  TSelectedFields extends SelectableFields,
>(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: TTranslateCurrencies[];
  fields: TSelectedFields;
}): AsyncIterable<DeepObjectFieldsPicked<MarketDataUpdate<TTranslateCurrencies>, TSelectedFields>>;

function getLiveMarketData(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: string[];
  fields: SelectableFields;
}): AsyncIterable<DeepObjectFieldsPicked<MarketDataUpdate<string>, Record<string, any>>> {
  // TODO: Need to enhance logic such that empty holding stats and empty lots symbols are excluded from the price observations, and are only reported once in the initial message with their zero stats

  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
    fields: {
      portfolios: params.fields?.portfolios ?? {},
      holdings: params.fields?.holdings ?? {},
      lots: params.fields?.lots ?? {},
    },
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const [
    requestedSomePortfolioStatsMarketDataFields,
    requestedSomeHoldingStatsMarketDataFields,
    requestedSomeLotsMarketDataFields,
  ] = [
    pipe(paramsNorm.fields.portfolios, ({ pnl, marketValue }) => [
      pnl,
      pnl?.byTranslateCurrencies,
      marketValue,
    ])
      .flatMap(fields => values(fields))
      .some(val => val === true),

    pipe(paramsNorm.fields.holdings, ({ pnl, priceData, marketValue }) => [
      pnl,
      pnl?.byTranslateCurrencies,
      priceData,
      marketValue,
    ])
      .flatMap(fields => values(fields))
      .some(val => val === true),

    pipe(paramsNorm.fields.lots, ({ pnl, priceData, marketValue }) => [
      pnl,
      pnl?.byTranslateCurrencies,
      priceData,
      marketValue,
    ])
      .flatMap(fields => values(fields))
      .some(val => val === true),
  ];

  const requestedSomeMarketDataFields =
    requestedSomePortfolioStatsMarketDataFields ||
    requestedSomeHoldingStatsMarketDataFields ||
    requestedSomeLotsMarketDataFields;

  const requestedSomePriceDataFields = [
    paramsNorm.fields.holdings.priceData,
    paramsNorm.fields.lots.priceData,
  ].some(
    priceData =>
      priceData?.currency ||
      priceData?.marketState ||
      priceData?.regularMarketPrice ||
      priceData?.regularMarketTime
  );

  const requestedSomeUnrealizedPnlFields = [
    paramsNorm.fields.portfolios.pnl,
    paramsNorm.fields.holdings.pnl,
    paramsNorm.fields.lots.pnl,
  ].some(
    pnl =>
      pnl?.amount ||
      pnl?.percent ||
      pnl?.byTranslateCurrencies?.amount ||
      pnl?.byTranslateCurrencies?.currency ||
      pnl?.byTranslateCurrencies?.exchangeRate
  );

  const observedStatsObjectsIter = observeStatsObjectChanges({ specifiers: paramsNorm.specifiers });

  const symbolPriceDataIter =
    !requestedSomePortfolioStatsMarketDataFields &&
    !requestedSomeHoldingStatsMarketDataFields &&
    !requestedSomeLotsMarketDataFields
      ? (async function* () {})()
      : getMarketDataByStatsObjectsIter({
          translateToCurrencies: paramsNorm.translateToCurrencies,
          ignoreClosedObjectStats: !requestedSomePriceDataFields,
          statsObjects: pipe(
            observedStatsObjectsIter,
            itMap(({ current: c }) => ({
              portfolioStats: !requestedSomePortfolioStatsMarketDataFields ? {} : c.portfolioStats,
              holdingStats: !requestedSomeHoldingStatsMarketDataFields ? {} : c.holdingStats,
              lots: !requestedSomeLotsMarketDataFields ? {} : c.lots,
            }))
          ),
        });

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
    statsOrPriceDataChangeIter =>
      itLazyDefer(() => {
        let allCurrStats = {
          portfolioStats: objectCreateNullProto(),
          holdingStats: objectCreateNullProto(),
          lots: objectCreateNullProto(),
        } as StatsObjectChanges['current'];

        const allCurrSymbolPriceData =
          objectCreateNullProto<DeepNonNullable<UpdatedSymbolPriceMap>>();

        const initialLoadOfSymbolPricesPromise = (async () => {
          const changedSymbols = await pipe(symbolPriceDataIter, itTakeFirst());
          assign(allCurrSymbolPriceData, changedSymbols);
        })();

        return pipe(
          statsOrPriceDataChangeIter,
          itMap(async ({ currentStats, changedStats, changedSymbols }) => {
            if (changedStats) {
              await initialLoadOfSymbolPricesPromise;
              allCurrStats = currentStats;
            } else {
              assign(allCurrSymbolPriceData, changedSymbols);
            }

            if (changedStats) {
              if (!requestedSomeMarketDataFields) {
                return changedStats;
              }
              return {
                portfolioStats: {
                  remove: changedStats.portfolioStats.remove,
                  set: changedStats.portfolioStats.set.filter(p =>
                    p.resolvedHoldings.every(
                      h => h.totalLotCount === 0 || h.symbol in allCurrSymbolPriceData
                    )
                  ),
                },
                holdingStats: {
                  remove: changedStats.holdingStats.remove,
                  set: changedStats.holdingStats.set.filter(
                    requestedSomePriceDataFields
                      ? h => h.symbol in allCurrSymbolPriceData
                      : h => h.totalLotCount === 0 || h.symbol in allCurrSymbolPriceData
                  ),
                },
                lots: {
                  remove: changedStats.lots.remove,
                  set: changedStats.lots.set.filter(
                    requestedSomePriceDataFields
                      ? lot => lot.symbol in allCurrSymbolPriceData
                      : lot => lot.remainingQuantity === 0 || lot.symbol in allCurrSymbolPriceData
                  ),
                },
              };
            }
            return {
              portfolioStats: {
                remove: [],
                set: filter(allCurrStats.portfolioStats, ({ resolvedHoldings }) =>
                  resolvedHoldings.some(h => h.totalLotCount > 0 && !!changedSymbols[h.symbol])
                ),
              },
              holdingStats: {
                remove: [],
                set: filter(allCurrStats.holdingStats, h => !!changedSymbols[h.symbol]),
              },
              lots: {
                remove: [],
                set: filter(allCurrStats.lots, p => !!changedSymbols[p.symbol]),
              },
            };
          }),
          itMap(changes => {
            // TODO: Need to refactor all calculations that follow to be decimal-accurate (with `pnpm add decimal.js-light`)

            const portfolioUpdates = (
              [
                [{ type: 'SET' }, changes.portfolioStats.set],
                [{ type: 'REMOVE' }, changes.portfolioStats.remove],
              ] as const
            ).flatMap(([{ type }, changed]) =>
              changed.map(pStats => {
                const { marketValue, pnl } =
                  !requestedSomeUnrealizedPnlFields && !paramsNorm.fields.portfolios.marketValue
                    ? {
                        marketValue: undefined,
                        pnl: undefined,
                      }
                    : (() => {
                        const { marketValue, pnlAmount, pnlPercent } =
                          portfolioStatsCalcMarketStats(pStats, allCurrSymbolPriceData);

                        const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                          pStats.forCurrency,
                          paramsNorm.translateToCurrencies,
                          pnlAmount,
                          allCurrSymbolPriceData
                        );

                        return {
                          marketValue: normalizeFloatImprecisions(marketValue),
                          pnl: {
                            amount: normalizeFloatImprecisions(pnlAmount),
                            percent: normalizeFloatImprecisions(pnlPercent),
                            byTranslateCurrencies: pnlByTranslateCurrencies,
                          },
                        };
                      })();

                return {
                  type,
                  portfolio: pStats,
                  marketValue,
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

                const priceData = !requestedSomePriceDataFields
                  ? undefined
                  : {
                      marketState: priceUpdateForSymbol.marketState,
                      currency: priceUpdateForSymbol.currency,
                      regularMarketTime: priceUpdateForSymbol.regularMarketTime,
                      regularMarketPrice: priceUpdateForSymbol.regularMarketPrice,
                    };

                const marketValue = (() => {
                  if (!requestedSomeHoldingStatsMarketDataFields) {
                    return;
                  }
                  return holding.totalQuantity === 0
                    ? 0
                    : holding.totalQuantity * priceUpdateForSymbol.regularMarketPrice;
                })();

                const pnl = !requestedSomeUnrealizedPnlFields
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

                return {
                  type,
                  holding,
                  priceData,
                  marketValue,
                  pnl,
                };
              })
            );

            const lotUpdates = (
              [
                [{ type: 'SET' }, changes.lots.set],
                [{ type: 'REMOVE' }, changes.lots.remove],
              ] as const
            ).flatMap(([{ type }, changed]) =>
              changed.map(lot => {
                const priceUpdateForSymbol = allCurrSymbolPriceData[lot.symbol];

                const priceData = !requestedSomePriceDataFields
                  ? undefined
                  : {
                      currency: priceUpdateForSymbol.currency,
                      marketState: priceUpdateForSymbol.marketState,
                      regularMarketTime: priceUpdateForSymbol.regularMarketTime,
                      regularMarketPrice: priceUpdateForSymbol.regularMarketPrice,
                    };

                const marketValue = (() => {
                  if (!requestedSomeLotsMarketDataFields) {
                    return;
                  }
                  return lot.remainingQuantity === 0
                    ? 0
                    : lot.remainingQuantity * priceUpdateForSymbol.regularMarketPrice;
                })();

                const pnl = !requestedSomeUnrealizedPnlFields
                  ? undefined
                  : (() => {
                      const [pnlAmount, pnlPercent] =
                        lot.remainingQuantity === 0
                          ? [0, 0]
                          : [
                              lot.remainingQuantity *
                                (priceUpdateForSymbol.regularMarketPrice - lot.openingTrade.price),
                              (priceUpdateForSymbol.regularMarketPrice / lot.openingTrade.price -
                                1) *
                                100,
                            ];

                      const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                        lot.symbolInfo.currency,
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
                  lot,
                  priceData,
                  marketValue,
                  pnl,
                };
              })
            );

            return {
              portfolios: portfolioUpdates,
              holdings: holdingUpdates,
              lots: lotUpdates,
            };
          }),
          source =>
            itLazyDefer(() => {
              const [allCurrPortfolioUpdates, allCurrHoldingUpdates, allCurrLotUpdates] = [
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<PortfolioMarketStatsUpdate<string>>;
                }>(),
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<HoldingMarketStatsUpdate<string>>;
                }>(),
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<LotMarketStatsUpdate<string>>;
                }>(),
              ];

              return pipe(
                source,
                itMap(({ portfolios, holdings, lots }) => {
                  const [
                    portfolioUpdatesRelevantToRequestor,
                    holdingUpdatesRelevantToRequestor,
                    lotUpdatesRelevantToRequestor,
                  ] = [
                    portfolios
                      .map(update => ({
                        orig: update,
                        formatted: deepObjectPickFields(update, paramsNorm.fields.portfolios),
                      }))
                      .filter(({ orig, formatted }) => {
                        const ownerIdAndCurrency = `${orig.portfolio.ownerId}_${orig.portfolio.forCurrency ?? ''}`;
                        return (
                          orig.type === 'REMOVE' ||
                          !isEqual(allCurrPortfolioUpdates[ownerIdAndCurrency], formatted)
                        );
                      }),

                    holdings
                      .map(update => ({
                        orig: update,
                        formatted: deepObjectPickFields(update, paramsNorm.fields.holdings),
                      }))
                      .filter(({ orig, formatted }) => {
                        const ownerIdAndSymbol = `${orig.holding.ownerId}_${orig.holding.symbol}`;
                        return (
                          orig.type === 'REMOVE' ||
                          !isEqual(allCurrHoldingUpdates[ownerIdAndSymbol], formatted)
                        );
                      }),

                    lots
                      .map(update => ({
                        orig: update,
                        formatted: deepObjectPickFields(update, paramsNorm.fields.lots),
                      }))
                      .filter(
                        ({ orig, formatted }) =>
                          orig.type === 'REMOVE' ||
                          !isEqual(allCurrLotUpdates[orig.lot.id], formatted)
                      ),
                  ];

                  for (const { orig, formatted } of portfolioUpdatesRelevantToRequestor) {
                    const key = `${orig.portfolio.ownerId}_${orig.portfolio.forCurrency ?? ''}`;
                    ({
                      ['SET']: () => (allCurrPortfolioUpdates[key] = formatted),
                      ['REMOVE']: () => delete allCurrPortfolioUpdates[key],
                    })[orig.type]();
                  }

                  for (const { orig, formatted } of holdingUpdatesRelevantToRequestor) {
                    const key = `${orig.holding.ownerId}_${orig.holding.symbol}`;
                    ({
                      ['SET']: () => (allCurrHoldingUpdates[key] = formatted),
                      ['REMOVE']: () => delete allCurrHoldingUpdates[key],
                    })[orig.type]();
                  }

                  for (const { orig, formatted } of lotUpdatesRelevantToRequestor) {
                    const key = orig.lot.id;
                    ({
                      ['SET']: () => (allCurrLotUpdates[key] = formatted),
                      ['REMOVE']: () => delete allCurrLotUpdates[key],
                    })[orig.type]();
                  }

                  return {
                    portfolios: portfolioUpdatesRelevantToRequestor.map(u => u.formatted),
                    holdings: holdingUpdatesRelevantToRequestor.map(u => u.formatted),
                    lots: lotUpdatesRelevantToRequestor.map(u => u.formatted),
                  };
                })
              );
            }),
          itFilter(
            ({ portfolios, holdings, lots }, i) =>
              i === 0 || portfolios.length + holdings.length + lots.length > 0
          )
        );
      }),
    itShare()
  );
}

type SelectableFields = {
  lots?: LotsSelectableFields;
  holdings?: HoldingsSelectableFields;
  portfolios?: PortfoliosSelectableFields;
};

type LotsSelectableFields = {
  type?: boolean;
  lot?: {
    id?: boolean;
    ownerId?: boolean;
    openingTradeId?: boolean;
    symbol?: boolean;
    originalQuantity?: boolean;
    remainingQuantity?: boolean;
    realizedProfitOrLoss?: boolean;
    openedAt?: boolean;
    recordCreatedAt?: boolean;
    recordUpdatedAt?: boolean;
  };
  priceData?: {
    currency?: boolean;
    marketState?: boolean;
    regularMarketTime?: boolean;
    regularMarketPrice?: boolean;
  };
  marketValue?: boolean;
  pnl?: {
    amount?: boolean;
    percent?: boolean;
    byTranslateCurrencies?: {
      amount?: boolean;
      currency?: boolean;
      exchangeRate?: boolean;
    };
  };
};

type HoldingsSelectableFields = {
  type?: boolean;
  holding?: {
    symbol?: boolean;
    ownerId?: boolean;
    lastRelatedTradeId?: boolean;
    totalLotCount?: boolean;
    totalQuantity?: boolean;
    totalPresentInvestedAmount?: boolean;
    totalRealizedAmount?: boolean;
    totalRealizedProfitOrLossAmount?: boolean;
    totalRealizedProfitOrLossRate?: boolean;
    currentPortfolioPortion?: boolean;
    breakEvenPrice?: boolean;
    lastChangedAt?: boolean;
  };
  priceData?: {
    currency?: boolean;
    marketState?: boolean;
    regularMarketTime?: boolean;
    regularMarketPrice?: boolean;
  };
  marketValue?: boolean;
  pnl?: {
    amount?: boolean;
    percent?: boolean;
    byTranslateCurrencies?: {
      amount?: boolean;
      currency?: boolean;
      exchangeRate?: boolean;
    };
  };
};

type PortfoliosSelectableFields = {
  type?: boolean;
  portfolio?: {
    relatedTradeId?: boolean;
    ownerId?: boolean;
    forCurrency?: boolean;
    totalPresentInvestedAmount?: boolean;
    totalRealizedAmount?: boolean;
    totalRealizedProfitOrLossAmount?: boolean;
    totalRealizedProfitOrLossRate?: boolean;
    lastChangedAt?: boolean;
  };
  marketValue?: boolean;
  pnl?: {
    amount?: boolean;
    percent?: boolean;
    byTranslateCurrencies?: {
      amount?: boolean;
      currency?: boolean;
      exchangeRate?: boolean;
    };
  };
};

type MarketDataUpdate<TTranslateCurrencies extends string = string> = {
  portfolios: PortfolioMarketStatsUpdate<TTranslateCurrencies>[];
  holdings: HoldingMarketStatsUpdate<TTranslateCurrencies>[];
  lots: LotMarketStatsUpdate<TTranslateCurrencies>[];
};

type PortfolioMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  portfolio: StatsObjects['portfolioStatsChanges'][string];
  marketValue: number;
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

type HoldingMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  holding: HoldingStats;
  priceData: InstrumentMarketPriceInfo;
  marketValue: number;
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

type LotMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  lot: Lot;
  priceData: InstrumentMarketPriceInfo;
  marketValue: number;
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

type InstrumentMarketPriceInfo = Pick<
  NonNullable<UpdatedSymbolPrice>,
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
