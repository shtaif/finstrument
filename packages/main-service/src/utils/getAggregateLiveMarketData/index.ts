import {
  assign,
  compact,
  keyBy,
  map,
  mapValues,
  reduce,
  groupBy,
  every,
  keys,
  flatMap,
} from 'lodash';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import { itMap, itFilter, itMerge, itLazyDefer, itShare, itTap } from 'iterable-operators';
import { marketDataService, type UpdatedSymbolPriceMap } from '../marketDataService/index.js';
import {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type StatsObjects,
} from '../observeStatsObjectChanges/index.js';

export { getAggregateLiveMarketData, type AggregateMarketDataUpdate };

function getAggregateLiveMarketData<TTranslateCurrencies extends string>(params: {
  specifiers: StatsObjectSpecifier[];
  translateToCurrencies?: TTranslateCurrencies[];
}): AsyncIterable<AggregateMarketDataUpdate<TTranslateCurrencies>> {
  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const observedStatsObjectsIter = pipe(
    observeStatsObjectChanges({
      specifiers: paramsNorm.specifiers,
      discardOverlapping: true,
    }),
    itMap(({ changes }) => {
      const portfolioResolvedHoldingsFlattened = pipe(
        changes.portfolioStats.set,
        v => flatMap(v, ({ resolvedHoldings }) => resolvedHoldings),
        v => keyBy(v, h => `${h.ownerId}_${h.symbol}`)
      );
      return {
        holdingStatsChanges: {
          ...keyBy(changes.holdingStats.set, ({ symbol }) => symbol),
          ...portfolioResolvedHoldingsFlattened,
        },
        positionChanges: keyBy(changes.positions.set, ({ id }) => id),
      };
    })
  );

  const symbolPriceDataIter = pipe(
    observedStatsObjectsIter,
    itMap(({ holdingStatsChanges, positionChanges }) => {
      const targetSymbols = [
        ...pipe(positionChanges, v => map(v, pos => pos.symbol)),
        ...pipe(holdingStatsChanges, v => map(v, holding => holding.symbol)),
      ];

      const translateCurrenciesExchangeSymbols = pipe(
        [
          ...map(positionChanges, ({ symbolInfo }) => symbolInfo.currency),
          ...map(holdingStatsChanges, ({ symbolInfo }) => symbolInfo.currency),
        ],
        v => compact(v),
        v =>
          v.flatMap(posCurrency =>
            paramsNorm.translateToCurrencies.map(adjCurrency => `${posCurrency}${adjCurrency}=X`)
          )
      );

      return [...targetSymbols, ...translateCurrenciesExchangeSymbols];
    }),
    symbolsIter => marketDataService.observeMarketData({ symbols: symbolsIter })
  );

  return pipe(
    observedStatsObjectsIter,
    observedStatsObjectsIter =>
      itLazyDefer(() => {
        const allHoldingStatsChanges = {} as StatsObjects['holdingStatsChanges'];
        const allPositionChanges = {} as StatsObjects['positionChanges'];
        const allSymbolPriceData = {} as UpdatedSymbolPriceMap;

        return pipe(
          itMerge(
            pipe(
              observedStatsObjectsIter,
              itTap(({ holdingStatsChanges, positionChanges }) => {
                assign(allHoldingStatsChanges, holdingStatsChanges);
                assign(allPositionChanges, positionChanges);
              }),
              itFilter(
                ({ holdingStatsChanges, positionChanges }) =>
                  every(holdingStatsChanges, h => h.symbol in allSymbolPriceData) &&
                  every(positionChanges, pos => pos.symbol in allSymbolPriceData)
              )
            ),
            pipe(
              symbolPriceDataIter,
              itTap(changedSymbols => {
                assign(allSymbolPriceData, changedSymbols);
              })
            )
          ),
          itMap(() => {
            const holdingsCombinedPnlByCurrency = pipe(
              allHoldingStatsChanges,
              v => groupBy(v, h => h.symbolInfo.currency ?? ''),
              v =>
                mapValues(v, holdings => {
                  const pnlAmount = reduce(
                    holdings,
                    (total, h) =>
                      total +
                      h.totalQuantity * (allSymbolPriceData[h.symbol]?.regularMarketPrice ?? 0) -
                      h.totalPresentInvestedAmount,
                    0
                  );
                  const totalInvestedAmount = reduce(
                    holdings,
                    (total, h) => total + h.totalPresentInvestedAmount,
                    0
                  );
                  return { pnlAmount, totalInvestedAmount };
                })
            );

            const positionsCombinedPnlByCurrency = pipe(
              allPositionChanges,
              v => groupBy(v, pos => pos.symbolInfo.currency ?? ''),
              v =>
                mapValues(v, positions => {
                  const pnlAmount = reduce(
                    positions,
                    (total, pos) =>
                      total +
                      pos.remainingQuantity *
                        ((allSymbolPriceData[pos.symbol]?.regularMarketPrice ?? 0) -
                          pos.openingTrade.price),
                    0
                  );
                  const totalInvestedAmount = reduce(
                    positions,
                    (total, pos) => total + pos.remainingQuantity * pos.openingTrade.price,
                    0
                  );
                  return { pnlAmount, totalInvestedAmount };
                })
            );

            const nativeCurrencyTotals = pipe(
              [...keys(holdingsCombinedPnlByCurrency), ...keys(positionsCombinedPnlByCurrency)],
              v => [...new Set(v)],
              v =>
                v.map(currency => {
                  const holdingsTotalPnlOfCurrency = holdingsCombinedPnlByCurrency[currency];
                  const positionsTotalPnlOfCurrency = positionsCombinedPnlByCurrency[currency];

                  const totalPnlAmountCombined =
                    (holdingsTotalPnlOfCurrency?.pnlAmount ?? 0) +
                    (positionsTotalPnlOfCurrency?.pnlAmount ?? 0);

                  const totalInvestedCombined =
                    (holdingsTotalPnlOfCurrency?.totalInvestedAmount ?? 0) +
                    (positionsTotalPnlOfCurrency?.totalInvestedAmount ?? 0);

                  return {
                    nativeCurrency: currency === '' ? null : currency,
                    pnl: {
                      amount: totalPnlAmountCombined,
                      rate: totalInvestedCombined / totalPnlAmountCombined,
                    },
                  };
                })
            );

            return nativeCurrencyTotals;
          }),
          itFilter(nativeCurrencies => !!nativeCurrencies.length),
          itMap(nativeCurrencies => {
            const translateCurrencies = paramsNorm.translateToCurrencies.map(translateCurrency => {
              return {
                translateCurrency,
                pnl: {
                  amount: nativeCurrencies.reduce((total, { nativeCurrency, pnl }) => {
                    const exchangeSymbol = `${nativeCurrency}${translateCurrency}=X`;
                    const exchangeRate =
                      allSymbolPriceData[exchangeSymbol]?.regularMarketPrice ?? 0;
                    return total + pnl.amount * exchangeRate;
                  }, 0),
                },
              };
            });
            return {
              nativeCurrencies,
              translateCurrencies,
            };
          })
        );
      }),
    itShare()
  );
}

// function getAggregateLiveMarketData2<TTranslateCurrencies extends string>(params: {
//   specifiers: StatsObjectSpecifier[];
//   translateToCurrencies?: TTranslateCurrencies[];
// }): AsyncIterable<AggregateMarketDataUpdate<TTranslateCurrencies>> {
//   const paramsNorm = {
//     specifiers: params.specifiers,
//     translateToCurrencies: params.translateToCurrencies ?? [],
//   };

//   if (!paramsNorm.specifiers.length) {
//     return empty();
//   }

//   return pipe(
//     getLiveMarketData({
//       specifiers: paramsNorm.specifiers,
//       translateToCurrencies: paramsNorm.translateToCurrencies,
//     }),
//     marketUpdatesIter =>
//       itLazyDefer(() => {
//         const allCurrTargetedDatas: {
//           holdings: { [ownerAndSymbol: string]: HoldingMarketStatsData<TTranslateCurrencies> };
//           positions: { [posId: string]: PositionMarketStatsData<TTranslateCurrencies> };
//         } = {
//           holdings: {},
//           positions: {},
//         };
//         return pipe(
//           marketUpdatesIter,
//           itTap(marketUpdates => {
//             for (const update of marketUpdates.holdings) {
//               allCurrTargetedDatas.holdings[`${update.holding.ownerId}_${update.holding.symbol}`] =
//                 update;
//             }
//             for (const update of marketUpdates.positions) {
//               allCurrTargetedDatas.positions[update.position.id] = update;
//             }
//           }),
//           itMap(() => {
//             const calcedConstituents = [
//               ...values(allCurrTargetedDatas.holdings),
//               ...values(allCurrTargetedDatas.positions),
//             ];

//             const holdingsAndPositionsCombinedPnlByCurrency = pipe(
//               calcedConstituents,
//               v => groupBy(v, ({ price }) => price.currency ?? ''),
//               v =>
//                 map(v, (calcedConstituents, currency) => {
//                   const totalPnlAmount = sumBy(calcedConstituents, c => c.profitOrLoss.amount);
//                   const totalOriginalInvestedAmount = sumBy(
//                     calcedConstituents,
//                     c => c.profitOrLoss.amount / c.profitOrLoss.percent
//                   );
//                   const totalPnlRate = totalPnlAmount / totalOriginalInvestedAmount;
//                   return {
//                     nativeCurrency: currency === '' ? null : currency,
//                     pnl: {
//                       amount: totalPnlAmount,
//                       rate: totalPnlRate,
//                     },
//                   };
//                 })
//             );

//             const translateCurrencies = paramsNorm.translateToCurrencies.map(translateCurrency => {
//               const combinedPnlAmountOfCurrency = sumBy(
//                 calcedConstituents,
//                 c =>
//                   find(
//                     c.profitOrLoss.byTranslateCurrencies,
//                     ({ currency }) => currency === translateCurrency
//                   )?.amount ?? 0
//               );
//               return {
//                 translateCurrency,
//                 pnl: {
//                   amount: combinedPnlAmountOfCurrency,
//                 },
//               };
//             });

//             return {
//               nativeCurrencies: holdingsAndPositionsCombinedPnlByCurrency,
//               translateCurrencies: translateCurrencies,
//             };
//           })
//         );
//       }),
//     itShare()
//   );
// }

type AggregateMarketDataUpdate<TTranslateCurrencies extends string = string> = {
  nativeCurrencies: {
    nativeCurrency: string | null;
    pnl: {
      amount: number;
      rate: number;
    };
  }[];
  translateCurrencies: {
    translateCurrency: TTranslateCurrencies;
    pnl: {
      amount: number;
    };
  }[];
};

(async () => {
  // const userId = '7eeae30b-4e5d-45aa-ad75-5bee1cb9cca6';
  // const iter = pipe(
  //   getAggregateLiveMarketData2({
  //     specifiers: [
  //       // { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: undefined },
  //       // { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'AAPL' },
  //       { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'ADBE' },
  //       { type: 'HOLDING', holdingPortfolioOwnerId: userId, holdingSymbol: 'AAPL' },
  //       { type: 'POSITION', positionId: 'c235e17f-b3e4-4051-8b9b-07b98126664d' },
  //       { type: 'POSITION', positionId: '95795a49-9561-4494-ba17-3809f33af0a7' },
  //     ],
  //     translateToCurrencies: ['ILS', 'GBP'],
  //   }),
  //   itTakeUntil(() => new Promise(resolve => setTimeout(resolve, 4000)))
  // );
  // for await (const updates of iter) {
  //   console.log('updates'.toUpperCase(), JSON.stringify(updates, undefined, 2));
  // }
})();

// (async () => {
//   try {
//     const iter = pipe(
//       getAggregateLiveMarketData({
//         specifiers: [
//           { type: 'POSITION', positionId: 'd8564fe6-e1f6-474e-998b-0754c15de21e' },
//           { type: 'POSITION', positionId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5' },

//           // { type: 'POSITION', positionId: 'd8564fe6-e1f6-474e-998b-0754c15de21e___' },
//           // { type: 'POSITION', positionId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5___' },

//           // { type: 'POSITION', positionId: 'd8564fe6-e1f6-474e-998b-000000000000' },
//           // { type: 'POSITION', positionId: '2d1b5cf0-a28c-456f-8378-000000000000' },
//         ],
//         translateToCurrencies: ['ILS', 'GBP'],
//       })
//       // itTakeUntil(() => new Promise(resolve => setTimeout(resolve, 4000)))
//     );

//     for await (const updates of iter) {
//       console.log('updates'.toUpperCase(), JSON.stringify(updates, undefined, 2));
//     }
//   } finally {
//   }
// })();
