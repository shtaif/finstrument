import { isEqual, values, compact } from 'lodash-es';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { type DeepPartial } from 'utility-types';
import { pipe } from 'shared-utils';
import { itMap, itFilter, itLazyDefer, itShare } from 'iterable-operators';
import {
  type StatsObjectSpecifier,
  type StatsObjects,
} from '../observeStatsObjectChanges/index.js';
import { type HoldingStats, type Lot } from '../positionsService/index.js';
import { normalizeFloatImprecisions } from '../normalizeFloatImprecisions.js';
import { objectCreateNullProto } from '../objectCreateNullProto.js';
import { observeStatsWithMarketDataHelper } from './observeStatsWithMarketDataHelper.js';
import { type UpdatedSymbolPrice } from '../marketDataService/index.js';
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
}): AsyncIterable<DeepPartial<MarketDataUpdate<string>>> {
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

  const statsWithMarketDataIter = observeStatsWithMarketDataHelper({
    forStatsObjects: paramsNorm.specifiers,
    symbolExtractor: {
      ignoreClosedObjectStats: !requestedSomePriceDataFields,
      includeMarketDataFor: {
        portfolios: requestedSomePortfolioStatsMarketDataFields,
        holdings: requestedSomeHoldingStatsMarketDataFields,
        lots: requestedSomeLotsMarketDataFields,
      },
      translateToCurrencies: compact([
        ...paramsNorm.translateToCurrencies,
        !paramsNorm.fields.holdings.holding?.currentPortfolioPortion
          ? undefined
          : unifiedCurrencyForPortfolioTotalValueCalcs,
      ]),
    },
  });

  return pipe(
    statsWithMarketDataIter,
    itMap(({ changedStats, currentMarketData }) => {
      // TODO: Need to refactor all calculations that follow to be decimal-accurate (with `pnpm add decimal.js-light`)

      const portfolioUpdates = (
        [
          [{ type: 'SET' }, changedStats.portfolioStats.set],
          [{ type: 'REMOVE' }, changedStats.portfolioStats.remove],
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
                  const { marketValue, pnlAmount, pnlPercent } = portfolioStatsCalcMarketStats(
                    pStats,
                    currentMarketData
                  );

                  const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                    pStats.forCurrency,
                    paramsNorm.translateToCurrencies,
                    pnlAmount,
                    currentMarketData
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
          [{ type: 'SET' }, changedStats.holdingStats.set],
          [{ type: 'REMOVE' }, changedStats.holdingStats.remove],
        ] as const
      ).flatMap(([{ type }, changed]) =>
        changed.map(holding => {
          const priceUpdateForSymbol = currentMarketData[holding.symbol];

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
                  currentMarketData
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
          [{ type: 'SET' }, changedStats.lots.set],
          [{ type: 'REMOVE' }, changedStats.lots.remove],
        ] as const
      ).flatMap(([{ type }, changed]) =>
        changed.map(lot => {
          const priceUpdateForSymbol = currentMarketData[lot.symbol];

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
                        (priceUpdateForSymbol.regularMarketPrice / lot.openingTrade.price - 1) *
                          100,
                      ];

                const pnlByTranslateCurrencies = calcPnlInTranslateCurrencies(
                  lot.symbolInfo.currency,
                  paramsNorm.translateToCurrencies,
                  pnlAmount,
                  currentMarketData
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
            [ownerIdAndCurrency: string]: DeepPartial<PortfolioMarketStatsUpdate>;
          }>(),
          objectCreateNullProto<{
            [ownerIdAndSymbol: string]: DeepPartial<HoldingMarketStatsUpdate>;
          }>(),
          objectCreateNullProto<{
            [lotId: string]: DeepPartial<LotMarketStatsUpdate>;
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
                    orig.type === 'REMOVE' || !isEqual(allCurrLotUpdates[orig.lot.id], formatted)
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
    ),
    itShare()
  );
}

const unifiedCurrencyForPortfolioTotalValueCalcs = 'USD';

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
