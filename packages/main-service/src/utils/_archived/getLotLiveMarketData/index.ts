import { assign, compact, filter, map } from 'lodash-es';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import {
  itMap,
  itTap,
  itFilter,
  itMerge,
  itShare,
  itLazyDefer,
  type ExtractAsyncIterableValue,
} from 'iterable-operators';
import { marketDataService, type UpdatedSymbolPriceMap } from '../../marketDataService/index.js';
import { observeStatsObjectChanges } from '../../observeStatsObjectChanges/index.js';

export { getLotLiveMarketData, type LotMarketDataUpdate, type LotPnlInfo };

function getLotLiveMarketData<TTranslateCurrencies extends string>(params: {
  specifiers: {
    lotId: string;
  }[];
  // specifiers: {
  //   lotId: string;
  //   ownerId?: string;
  // }[];
  translateToCurrencies?: TTranslateCurrencies[];
}): AsyncIterable<LotMarketDataUpdate<TTranslateCurrencies>[]> {
  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const changedLotsIter = pipe(
    observeStatsObjectChanges({
      specifiers: params.specifiers.map(({ lotId }) => ({ type: 'LOT', lotId })),
    }),
    itMap(({ changes }) => changes.lots.set),
    itShare()
  );

  const symbolPriceDataIter = pipe(
    changedLotsIter,
    itMap(lots => {
      const targetSymbols = pipe(lots, v => v.map(({ symbol }) => symbol));
      const translateCurrenciesExchangeSymbols = pipe(
        lots,
        v => map(v, ({ symbolInfo }) => symbolInfo.currency),
        v => compact(v),
        v =>
          v.flatMap(lotCurrency =>
            paramsNorm.translateToCurrencies.map(adjCurrency => `${lotCurrency}${adjCurrency}=X`)
          )
      );
      return [...targetSymbols, ...translateCurrenciesExchangeSymbols];
    }),
    symbols => marketDataService.observeMarketData({ symbols })
  );

  return itLazyDefer(() => {
    let allLots = [] as ExtractAsyncIterableValue<typeof changedLotsIter>;
    const allSymbolPriceData = {} as UpdatedSymbolPriceMap;

    return pipe(
      itMerge(
        pipe(
          changedLotsIter,
          itTap(changedPositions => (allLots = changedPositions))
        ),
        pipe(
          symbolPriceDataIter,
          itTap(changedSymbols => assign(allSymbolPriceData, changedSymbols)),
          itMap(changedSymbols =>
            allLots.filter(
              lot =>
                lot.symbol in changedSymbols ||
                (paramsNorm.translateToCurrencies.length &&
                  lot.symbolInfo.currency &&
                  paramsNorm.translateToCurrencies.some(
                    adjCurrency => `${lot.symbolInfo.currency!}${adjCurrency}=X` in changedSymbols
                  ))
            )
          )
        )
      ),
      itMap(lotsToRecalculate => {
        return pipe(
          lotsToRecalculate,
          v => filter(v, lot => lot.symbol in allSymbolPriceData),
          v =>
            map(v, lot => {
              const pnlAmount =
                lot.remainingQuantity *
                ((allSymbolPriceData[lot.symbol]?.regularMarketPrice ?? 0) -
                  lot.openingTrade.price);

              const pnlPercent =
                ((allSymbolPriceData[lot.symbol]?.regularMarketPrice ?? 0) /
                  lot.openingTrade.price -
                  1) *
                100;

              const pnlByTranslateCurrencies = pipe(
                paramsNorm.translateToCurrencies.map(translateCurrency => {
                  const exchangeSymbol = `${lot.symbolInfo.currency}${translateCurrency}=X`;
                  const exchangeRate = allSymbolPriceData[exchangeSymbol]?.regularMarketPrice;
                  return !exchangeRate
                    ? undefined
                    : {
                        currency: translateCurrency,
                        exchangeRate: exchangeRate,
                        amount: pnlAmount * exchangeRate,
                      };
                }),
                compact
              );

              return {
                lotId: lot.id,
                profitOrLoss: {
                  percent: pnlPercent,
                  amount: pnlAmount,
                  byTranslateCurrencies: pnlByTranslateCurrencies,
                },
              };
            })
        );
      }),
      itFilter(lotUpdates => !!lotUpdates.length)
    );
  });
}

type LotMarketDataUpdate<TTranslateCurrencies extends string = string> = {
  lotId: string;
  profitOrLoss: LotPnlInfo<TTranslateCurrencies>;
};

type LotPnlInfo<TTranslateCurrencies extends string> = {
  percent: number;
  amount: number;
  byTranslateCurrencies: {
    currency: TTranslateCurrencies;
    exchangeRate: number;
    amount: number;
  }[];
};

// (async () => {
//   try {
//     const iter = pipe(
//       getLotsLiveMarketData({
//         specifiers: [
//           { lotId: 'd8564fe6-e1f6-474e-998b-0754c15de21e' },
//           { lotId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5' },

//           // { lotId: 'd8564fe6-e1f6-474e-998b-0754c15de21e___' },
//           // { lotId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5___' },

//           // { lotId: 'd8564fe6-e1f6-474e-998b-000000000000' },
//           // { lotId: '2d1b5cf0-a28c-456f-8378-000000000000' },
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
