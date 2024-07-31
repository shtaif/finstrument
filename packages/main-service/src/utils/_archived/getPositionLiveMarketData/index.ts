import { assign, compact, filter, map } from 'lodash';
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

export { getPositionLiveMarketData, type PositionMarketDataUpdate, type PositionPnlInfo };

function getPositionLiveMarketData<TTranslateCurrencies extends string>(params: {
  specifiers: {
    positionId: string;
  }[];
  // specifiers: {
  //   positionId: string;
  //   ownerId?: string;
  // }[];
  translateToCurrencies?: TTranslateCurrencies[];
}): AsyncIterable<PositionMarketDataUpdate<TTranslateCurrencies>[]> {
  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const changedPositionsIter = pipe(
    observeStatsObjectChanges({
      specifiers: params.specifiers.map(({ positionId }) => ({ type: 'POSITION', positionId })),
    }),
    itMap(({ changes }) => changes.positions.set),
    itShare()
  );

  const symbolPriceDataIter = pipe(
    changedPositionsIter,
    itMap(positions => {
      const targetSymbols = pipe(positions, v => v.map(({ symbol }) => symbol));
      const translateCurrenciesExchangeSymbols = pipe(
        positions,
        v => map(v, ({ symbolInfo }) => symbolInfo.currency),
        v => compact(v),
        v =>
          v.flatMap(posCurrency =>
            paramsNorm.translateToCurrencies.map(adjCurrency => `${posCurrency}${adjCurrency}=X`)
          )
      );
      return [...targetSymbols, ...translateCurrenciesExchangeSymbols];
    }),
    symbols => marketDataService.observeMarketData({ symbols })
  );

  return itLazyDefer(() => {
    let allPositions = [] as ExtractAsyncIterableValue<typeof changedPositionsIter>;
    const allSymbolPriceData = {} as UpdatedSymbolPriceMap;

    return pipe(
      itMerge(
        pipe(
          changedPositionsIter,
          itTap(changedPositions => (allPositions = changedPositions))
        ),
        pipe(
          symbolPriceDataIter,
          itTap(changedSymbols => assign(allSymbolPriceData, changedSymbols)),
          itMap(changedSymbols =>
            allPositions.filter(
              pos =>
                pos.symbol in changedSymbols ||
                (paramsNorm.translateToCurrencies.length &&
                  pos.symbolInfo.currency &&
                  paramsNorm.translateToCurrencies.some(
                    adjCurrency => `${pos.symbolInfo.currency!}${adjCurrency}=X` in changedSymbols
                  ))
            )
          )
        )
      ),
      itMap(positionsToRecalculate => {
        return pipe(
          positionsToRecalculate,
          v => filter(v, pos => pos.symbol in allSymbolPriceData),
          v =>
            map(v, pos => {
              const pnlAmount =
                pos.remainingQuantity *
                ((allSymbolPriceData[pos.symbol]?.regularMarketPrice ?? 0) -
                  pos.openingTrade.price);

              const pnlPercent =
                ((allSymbolPriceData[pos.symbol]?.regularMarketPrice ?? 0) /
                  pos.openingTrade.price -
                  1) *
                100;

              const pnlByTranslateCurrencies = pipe(
                paramsNorm.translateToCurrencies.map(translateCurrency => {
                  const exchangeSymbol = `${pos.symbolInfo.currency}${translateCurrency}=X`;
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
                positionId: pos.id,
                profitOrLoss: {
                  percent: pnlPercent,
                  amount: pnlAmount,
                  byTranslateCurrencies: pnlByTranslateCurrencies,
                },
              };
            })
        );
      }),
      itFilter(positionUpdates => !!positionUpdates.length)
    );
  });
}

type PositionMarketDataUpdate<TTranslateCurrencies extends string = string> = {
  positionId: string;
  profitOrLoss: PositionPnlInfo<TTranslateCurrencies>;
};

type PositionPnlInfo<TTranslateCurrencies extends string> = {
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
//       getPositionLiveMarketData({
//         specifiers: [
//           { positionId: 'd8564fe6-e1f6-474e-998b-0754c15de21e' },
//           { positionId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5' },

//           // { positionId: 'd8564fe6-e1f6-474e-998b-0754c15de21e___' },
//           // { positionId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5___' },

//           // { positionId: 'd8564fe6-e1f6-474e-998b-000000000000' },
//           // { positionId: '2d1b5cf0-a28c-456f-8378-000000000000' },
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
