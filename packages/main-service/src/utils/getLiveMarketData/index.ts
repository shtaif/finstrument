import { assign, filter, isEqual, values, isObjectLike } from 'lodash-es';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import {
  type DeepNonNullable,
  type DeepPartial,
  type SetIntersection,
  type OmitByValue,
} from 'utility-types';
import { type O } from 'ts-toolbelt';
import { pipe } from 'shared-utils';
import { itMap, itFilter, itMerge, itLazyDefer, itShare, itTakeFirst } from 'iterable-operators';
import {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type StatsObjects,
  type StatsObjectChanges2,
} from '../observeStatsObjectChanges/index.js';
import { type HoldingStats, type Position } from '../positionsService/index.js';
import { normalizeFloatImprecisions } from '../normalizeFloatImprecisions.js';
import { objectCreateNullProto } from '../objectCreateNullProto.js';
import {
  getMarketDataByStatsObjectsIter,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from './getMarketDataByStatsObjectsIter.js';
import { portfolioStatsCalcPnl } from './portfolioStatsCalcPnl.js';
import { calcPnlInTranslateCurrencies } from './calcPnlInTranslateCurrencies.js';
import { calcHoldingRevenue } from './calcHoldingRevenue.js';
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

// const _____ = getLiveMarketData({
//   specifiers: [],
//   translateToCurrencies: ['CAD'],
//   fields: {
//     positions: {
//       position: {
//         id: true,
//         originalQuantity: true,
//         remainingQuantity: true,
//       },
//       priceData: {
//         regularMarketPrice: true as boolean,
//         marketState: true,
//       },
//       pnl: {
//         amount: true as boolean,
//         percent: false,
//         byTranslateCurrencies: {
//           amount: false as boolean,
//           currency: false as boolean,
//           exchangeRate: false,
//         },
//       },
//     },
//   },
// });

function getLiveMarketData<
  TTranslateCurrencies extends string,
  TSelectableFields extends SelectableFields,
>(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: TTranslateCurrencies[];
  fields: TSelectableFields;
}): AsyncIterable<
  DeepObjectFieldsPicked<MarketDataUpdate<TTranslateCurrencies>, TSelectableFields>
>;

function getLiveMarketData(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: string[];
  fields: SelectableFields;
}): AsyncIterable<DeepObjectFieldsPicked<MarketDataUpdate<string>, Record<string, any>>> {
  // TODO: Need to enhance logic such that empty holding stats and empty positions symbols are excluded from the price observations, and are only reported once in the initial message with their zero stats

  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
    fields: {
      portfolios: params.fields?.portfolios ?? {},
      holdings: params.fields?.holdings ?? {},
      positions: params.fields?.positions ?? {},
    },
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const [
    requestedSomePortfolioStatsMarketDataFields,
    requestedSomeHoldingStatsMarketDataFields,
    requestedSomePositionsMarketDataFields,
  ] = [
    pipe(paramsNorm.fields.portfolios, ({ pnl }) => [pnl, pnl?.byTranslateCurrencies])
      .flatMap(fields => values(fields))
      .some(val => val === true),

    pipe(paramsNorm.fields.holdings, ({ pnl, priceData }) => [
      pnl,
      pnl?.byTranslateCurrencies,
      priceData,
    ])
      .flatMap(fields => values(fields))
      .some(val => val === true),

    pipe(paramsNorm.fields.positions, ({ pnl, priceData }) => [
      pnl,
      pnl?.byTranslateCurrencies,
      priceData,
    ])
      .flatMap(fields => values(fields))
      .some(val => val === true),
  ];

  const requestedSomePriceDataFields = [
    paramsNorm.fields.holdings.priceData,
    paramsNorm.fields.positions.priceData,
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
    paramsNorm.fields.positions.pnl,
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
    !requestedSomePositionsMarketDataFields
      ? (async function* () {})()
      : getMarketDataByStatsObjectsIter({
          translateToCurrencies: paramsNorm.translateToCurrencies,
          ignoreClosedObjectStats: !requestedSomePriceDataFields,
          statsObjects: pipe(
            observedStatsObjectsIter,
            itMap(({ current: c }) => ({
              portfolioStats: !requestedSomePortfolioStatsMarketDataFields ? {} : c.portfolioStats,
              holdingStats: !requestedSomeHoldingStatsMarketDataFields ? {} : c.holdingStats,
              positions: !requestedSomePositionsMarketDataFields ? {} : c.positions,
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
        let allCurrStats = {
          portfolioStats: objectCreateNullProto(),
          holdingStats: objectCreateNullProto(),
          positions: objectCreateNullProto(),
        } as StatsObjectChanges2['current'];

        const allCurrSymbolPriceData =
          objectCreateNullProto<DeepNonNullable<UpdatedSymbolPriceMap>>();

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

              return !requestedSomeUnrealizedPnlFields && !requestedSomePriceDataFields
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
                        requestedSomePriceDataFields
                          ? h => h.symbol in allCurrSymbolPriceData
                          : h => h.totalPositionCount === 0 || h.symbol in allCurrSymbolPriceData
                      ),
                    },
                    positions: {
                      remove: changedStats.positions.remove,
                      set: changedStats.positions.set.filter(
                        requestedSomePriceDataFields
                          ? pos => pos.symbol in allCurrSymbolPriceData
                          : pos =>
                              pos.remainingQuantity === 0 || pos.symbol in allCurrSymbolPriceData
                      ),
                    },
                  };
            }
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
                const pnl = !requestedSomeUnrealizedPnlFields
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

                return { type, portfolio: pStats, pnl };
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

                const priceData = !requestedSomePriceDataFields
                  ? undefined
                  : {
                      currency: priceUpdateForSymbol.currency,
                      marketState: priceUpdateForSymbol.marketState,
                      regularMarketTime: priceUpdateForSymbol.regularMarketTime,
                      regularMarketPrice: priceUpdateForSymbol.regularMarketPrice,
                    };

                const pnl = !requestedSomeUnrealizedPnlFields
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
          }),
          source =>
            itLazyDefer(() => {
              const [allCurrPortfolioUpdates, allCurrHoldingUpdates, allCurrPositionUpdates] = [
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<PortfolioMarketStatsUpdate<string>>;
                }>(),
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<HoldingMarketStatsUpdate<string>>;
                }>(),
                objectCreateNullProto<{
                  [ownerIdAndSymbol: string]: DeepPartial<PositionMarketStatsUpdate<string>>;
                }>(),
              ];

              return pipe(
                source,
                itMap(({ portfolios, holdings, positions }) => {
                  const [
                    portfolioUpdatesRelevantToRequestor,
                    holdingUpdatesRelevantToRequestor,
                    positionUpdatesRelevantToRequestor,
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

                    positions
                      .map(update => ({
                        orig: update,
                        formatted: deepObjectPickFields(update, paramsNorm.fields.positions),
                      }))
                      .filter(
                        ({ orig, formatted }) =>
                          orig.type === 'REMOVE' ||
                          !isEqual(allCurrPositionUpdates[orig.position.id], formatted)
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

                  for (const { orig, formatted } of positionUpdatesRelevantToRequestor) {
                    const key = orig.position.id;
                    ({
                      ['SET']: () => (allCurrPositionUpdates[key] = formatted),
                      ['REMOVE']: () => delete allCurrPositionUpdates[key],
                    })[orig.type]();
                  }

                  return {
                    portfolios: portfolioUpdatesRelevantToRequestor.map(u => u.formatted),
                    holdings: holdingUpdatesRelevantToRequestor.map(u => u.formatted),
                    positions: positionUpdatesRelevantToRequestor.map(u => u.formatted),
                  };
                })
              );
            }),
          itFilter(
            ({ portfolios, holdings, positions }, i) =>
              i === 0 || portfolios.length + holdings.length + positions.length > 0
          )
        );
      }),
    itShare()
  );
}

function deepObjectPickFields<
  TObj extends object,
  // TFieldSelectTree extends AllLeafPropsIntoBools<TObj>,
  TFieldSelectTree extends Record<string, any>,
>(
  sourceObj: TObj,
  fieldSelectTree: TFieldSelectTree
): DeepObjectFieldsPicked<TObj, TFieldSelectTree> {
  const deepReformattedObjResult = (function recurse(
    sourceObj: Record<string, any>,
    selectedFieldsNode: Record<string, any>
  ) {
    const resultObj: Record<string, any> = {};

    for (const field in selectedFieldsNode) {
      const fieldVal = selectedFieldsNode[field];
      if (fieldVal === true) {
        resultObj[field] = sourceObj[field];
      } else if (isObjectLike(fieldVal) && isObjectLike(sourceObj[field])) {
        if (!Array.isArray(sourceObj[field])) {
          resultObj[field] = recurse(sourceObj[field], fieldVal);
        } else {
          resultObj[field] = sourceObj[field].map(sourceObjItem =>
            recurse(sourceObjItem, fieldVal)
          );
        }
      }
    }

    return resultObj;
  })(sourceObj, fieldSelectTree) as DeepObjectFieldsPicked<TObj, TFieldSelectTree>;

  return deepReformattedObjResult;
}

const deepObjectPickFieldsTest = deepObjectPickFields(
  {
    holdings: [
      {
        a: 'aaa',
        b: 'bbb',
        c: { a: 'aaa', b: 'bbb' },
      } as const,
      {
        a: 'aaa',
        b: 'bbb',
        c: { a: 'aaa', b: 'bbb' },
      } as const,
    ],
  },
  {
    holdings: {
      a: true,
      b: true,
      c: { a: false, b: true },
    },
  }
);
deepObjectPickFieldsTest.holdings[0].c.a;

type DeepObjectFieldsPicked<
  TObj extends object,
  TFieldSelection /* extends AllLeafPropsIntoBools<TObj>*/,
> = {
  [K in SetIntersection<
    keyof TObj,
    keyof OmitByValue<TFieldSelection, undefined | false>
  >]: TFieldSelection[K] extends true
    ? TObj[K]
    : TObj[K] extends object[]
      ? DeepObjectFieldsPicked<TObj[K][number], NonNullable<TFieldSelection[K]>>[]
      : TObj[K] extends object
        ? TFieldSelection[K] extends object
          ? DeepObjectFieldsPicked<TObj[K], TFieldSelection[K]>
          : never
        : never;
};

const myTestObjPicked = {
  d: {
    a: 'aaa',
    b: {
      a: 'aaa',
      b: [{ a: 'aaa' }],
    },
  },
} as TestingType;

type TestingType = DeepObjectFieldsPicked<
  {
    a: 'aaa';
    b: 'bbb';
    c: false;
    d: {
      a: 'aaa';
      b: {
        a: 'aaa';
        b: { a: 'aaa' }[];
      };
    };
  },
  {
    a: true;
    b: true;
    c: false;
    d: {
      a: true;
      b: {
        a: true;
        b: { a: true };
      };
    };
  }
>;

type AllLeafPropsIntoBools<T> = AllLeafPropsIntoBoolsInnerTraverser<DeepFlattenNestedArrays<T>>;

type AllLeafPropsIntoBoolsInnerTraverser<T> = {
  [K in keyof T]?: T[K] extends { [k: string]: unknown }
    ? AllLeafPropsIntoBoolsInnerTraverser<T[K]>
    : boolean;
};

type DeepFlattenNestedArrays<T> = T extends unknown[]
  ? DeepFlattenNestedArrays<T[number]>
  : T extends { [k: string]: unknown }
    ? {
        [K in keyof T]: DeepFlattenNestedArrays<T[K]>;
      }
    : T;

type TypeExtends<T extends TExtendTarget, TExtendTarget> = T;

type ObjectHasValue<TObj, TVal> = TObj extends {}
  ? O.Includes<TObj, TVal, 'contains->'> extends 1
    ? true
    : false
  : false;

type IfNever<T, TFallback> = [T] extends [never] ? TFallback : T;

type SelectableFields = {
  positions?: PositionsSelectableFields2;
  holdings?: HoldingsSelectableFields2;
  portfolios?: PortfoliosSelectableFields2;
};

type PortfoliosSelectableFields = AllLeafPropsIntoBools<PortfolioMarketStatsUpdate>;
type HoldingsSelectableFields = AllLeafPropsIntoBools<HoldingMarketStatsUpdate>;
type PositionsSelectableFields = AllLeafPropsIntoBools<PositionMarketStatsUpdate>;
// type SelectableFields = AllLeafPropsIntoBools<MarketDataUpdate<true, true>>;

type PortfoliosSelectableFields_old = PortfoliosSelectableFields;
type PortfoliosSelectableFields2 = {
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

type HoldingsSelectableFields2 = TypeExtends<
  HoldingsSelectableFields,
  {
    type?: boolean;
    holding?: {
      symbol?: boolean;
      ownerId?: boolean;
      lastRelatedTradeId?: boolean;
      totalPositionCount?: boolean;
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
    pnl?: {
      amount?: boolean;
      percent?: boolean;
      byTranslateCurrencies?: {
        amount?: boolean;
        currency?: boolean;
        exchangeRate?: boolean;
      };
    };
  }
>;

type PositionsSelectableFields2 = {
  type?: boolean;
  position?: {
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

type _____ = AllLeafPropsIntoBools<{
  a: 'aaa';
  b: 'bbb';
  c: false;
  d: {
    a: 'aaa';
    b: {
      a: 'aaa';
      b: [{ a: 'aaa' }, { a: 'aaa' }];
    };
  };
}>;

type MarketDataUpdate<TTranslateCurrencies extends string = string> = {
  portfolios: PortfolioMarketStatsUpdate<TTranslateCurrencies>[];
  holdings: HoldingMarketStatsUpdate<TTranslateCurrencies>[];
  positions: PositionMarketStatsUpdate<TTranslateCurrencies>[];
};

type PortfolioMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  portfolio: StatsObjects['portfolioStatsChanges'][string];
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

type HoldingMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  holding: HoldingStats;
  priceData: InstrumentMarketPriceInfo;
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

type PositionMarketStatsUpdate<TTranslateCurrencies extends string = string> = {
  type: 'SET' | 'REMOVE';
  position: Position;
  priceData: InstrumentMarketPriceInfo;
  pnl: PnlInfo<TTranslateCurrencies>; // TODO: Rename this prop into `unrealizedPnl`
};

// type MarketDataUpdate<
//   TWithPriceData extends boolean = false,
//   TWithPnl extends boolean = false,
//   TTranslateCurrencies extends string = string,
// > = {
//   portfolios: PortfolioMarketStatsUpdate<
//     TWithPnl extends true ? true : false,
//     TTranslateCurrencies
//   >[];
//   holdings: HoldingMarketStatsUpdate<
//     TWithPriceData extends true ? true : false,
//     TWithPnl extends true ? true : false,
//     TTranslateCurrencies
//   >[];
//   positions: PositionMarketStatsUpdate<
//     TWithPriceData extends true ? true : false,
//     TWithPnl extends true ? true : false,
//     TTranslateCurrencies
//   >[];
// };

// type PortfolioMarketStatsUpdate<
//   TWithPnl extends boolean = false,
//   TTranslateCurrencies extends string = string,
// > = {
//   type: 'SET' | 'REMOVE';
//   portfolio: StatsObjects['portfolioStatsChanges'][string];
//   pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined; // TODO: Rename this prop into `unrealizedPnl`
// };

// type HoldingMarketStatsUpdate<
//   TWithPriceData extends boolean = false,
//   TWithPnl extends boolean = false,
//   TTranslateCurrencies extends string = string,
// > = {
//   type: 'SET' | 'REMOVE';
//   holding: HoldingStats;
//   priceData: TWithPriceData extends true ? InstrumentMarketPriceInfo : undefined;
//   pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined; // TODO: Rename this prop into `unrealizedPnl`
// };

// type PositionMarketStatsUpdate<
//   TWithPriceData extends boolean = false,
//   TWithPnl extends boolean = false,
//   TTranslateCurrencies extends string = string,
// > = {
//   type: 'SET' | 'REMOVE';
//   position: Position;
//   priceData: TWithPriceData extends true ? InstrumentMarketPriceInfo : undefined;
//   pnl: TWithPnl extends true ? PnlInfo<TTranslateCurrencies> : undefined; // TODO: Rename this prop into `unrealizedPnl`
// };

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
