import {
  assign,
  compact,
  filter,
  flatMap,
  groupBy,
  keyBy,
  map,
  mapValues,
  pickBy,
  uniq,
} from 'lodash-es';
import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import {
  itMap,
  itTap,
  itMerge,
  itShare,
  itLazyDefer,
  type ExtractAsyncIterableValue,
  itFilter,
} from 'iterable-operators';
import { marketDataService, type UpdatedSymbolPriceMap } from '../../marketDataService/index.js';
import positionsService from '../../positionsService/index.js';
import { getInstrumentInfos } from '../../getInstrumentInfos/index.js';

export { getPortfolioLiveMarketData, type PortfolioLiveMarketDataUpdate, type PortfolioPnlInfo };

function getPortfolioLiveMarketData<TTranslateCurrencies extends string>(params: {
  specifiers: {
    portfolioOwnerId: string;
    forCurrency: string;
  }[];
  translateToCurrencies?: TTranslateCurrencies[];
}): AsyncIterable<PortfolioLiveMarketDataUpdate<TTranslateCurrencies>[]> {
  const paramsNorm = {
    specifiers: params.specifiers,
    translateToCurrencies: params.translateToCurrencies ?? [],
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const updatedPortfoliosIter = pipe(
    positionsService.observePortfolioChanges(
      paramsNorm.specifiers.map(({ portfolioOwnerId, forCurrency }) => ({
        ownerId: portfolioOwnerId,
        forCurrency,
      }))
    ),
    itMap(async changedPortfolios => {
      const holdings = await positionsService.retrieveHoldingStats({
        filters: { ownerIds: uniq(changedPortfolios.map(({ ownerId }) => ownerId)) },
      });

      const overallSymbolInfos = await getInstrumentInfos({
        symbols: holdings.map(({ symbol }) => symbol),
      });

      const holdingsGroupedByOwnerAndCurrency = groupBy(
        holdings,
        ({ ownerId, symbol }) => `${ownerId}_${overallSymbolInfos[symbol]?.currency ?? ''}`
      );

      const portfolioMap = pipe(
        changedPortfolios,
        v => keyBy(v, ({ ownerId, forCurrency }) => `${ownerId}_${forCurrency ?? ''}`),
        v =>
          mapValues(v, p => ({
            portfolio: p,
            holdings: holdingsGroupedByOwnerAndCurrency[`${p.ownerId}_${p.forCurrency ?? ''}`],
          }))
      );

      return portfolioMap;
    }),
    itShare()
  );

  const symbolPriceDataIter = pipe(
    updatedPortfoliosIter,
    itMap(portfolioMap => {
      const targetSymbols = pipe(
        portfolioMap,
        v => flatMap(v, ({ holdings }) => holdings),
        v => v.map(({ symbol }) => symbol)
      );
      const translateCurrenciesExchangeSymbols = pipe(
        portfolioMap,
        v => map(v, ({ portfolio }) => portfolio.forCurrency),
        v => compact(v),
        v =>
          v.flatMap(pCurrency =>
            paramsNorm.translateToCurrencies.map(adjCurrency => `${pCurrency}${adjCurrency}=X`)
          )
      );
      return [...targetSymbols, ...translateCurrenciesExchangeSymbols];
    }),
    symbols => marketDataService.observeMarketData({ symbols })
  );

  return itLazyDefer(() => {
    const allPortfolios = {} as ExtractAsyncIterableValue<typeof updatedPortfoliosIter>;
    const allSymbolPriceData = {} as UpdatedSymbolPriceMap;

    return pipe(
      itMerge(
        pipe(
          updatedPortfoliosIter,
          itTap(changedPortfolios => assign(allPortfolios, changedPortfolios))
        ),
        pipe(
          symbolPriceDataIter,
          itTap(changedSymbols => assign(allSymbolPriceData, changedSymbols)),
          itMap(changedSymbols =>
            pickBy(allPortfolios, ({ portfolio, holdings }) =>
              holdings.some(
                h =>
                  h.symbol in changedSymbols ||
                  (paramsNorm.translateToCurrencies.length &&
                    portfolio.forCurrency &&
                    paramsNorm.translateToCurrencies.some(
                      adjCurrency => `${portfolio.forCurrency!}${adjCurrency}=X` in changedSymbols
                    ))
              )
            )
          )
        )
      ),
      itMap(portfoliosToRecalculate => {
        return pipe(
          portfoliosToRecalculate,
          v => filter(v, ({ holdings }) => holdings.every(h => h.symbol in allSymbolPriceData)),
          v =>
            map(v, ({ portfolio, holdings }) => {
              const holdingsTotalMarketWorth = holdings.reduce(
                (total, h) =>
                  total + (allSymbolPriceData[h.symbol]?.regularMarketPrice ?? 0) * h.totalQuantity,
                0
              );

              const pnlAmount = holdingsTotalMarketWorth - portfolio.totalPresentInvestedAmount;

              const pnlPercent =
                (holdingsTotalMarketWorth / portfolio.totalPresentInvestedAmount - 1) * 100;

              const pnlWithTranslateCurrency = pipe(
                paramsNorm.translateToCurrencies.map(translateCurrency => {
                  const exchangeSymbol = `${portfolio.forCurrency}${translateCurrency}=X`;
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
                portfolioOwnerId: portfolio.ownerId,
                forCurrency: portfolio.forCurrency,
                profitOrLoss: {
                  percent: pnlPercent,
                  amount: pnlAmount,
                  withTranslateCurrencies: pnlWithTranslateCurrency,
                },
              };
            })
        );
      }),
      itFilter(portfolioUpdates => !!portfolioUpdates.length)
    );
  });
}

type PortfolioLiveMarketDataUpdate<TTranslateCurrencies extends string = string> = {
  portfolioOwnerId: string;
  forCurrency: string | null;
  profitOrLoss: PortfolioPnlInfo<TTranslateCurrencies>;
};

type PortfolioPnlInfo<TTranslateCurrencies extends string> = {
  percent: number;
  amount: number;
  withTranslateCurrencies: {
    currency: TTranslateCurrencies;
    exchangeRate: number;
    amount: number;
  }[];
};

// (async () => {
//   // console.log('START !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
//   // await new Promise(resolve => setTimeout(resolve, 4000));
//   // console.log('END !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');

//   const iter = pipe(
//     getPortfolioLiveMarketData({
//       specifiers: [
//         {
//           portfolioOwnerId: 'c57066e8-694e-4a33-bd5b-f1d228033402',
//           forCurrency: 'USD',
//         },
//       ],
//       translateToCurrencies: ['ILS', 'GBP'],
//     })
//     // getPositionLiveMarketData({
//     //   specifiers: [
//     //     { positionId: 'd8564fe6-e1f6-474e-998b-0754c15de21e' },
//     //     { positionId: '2d1b5cf0-a28c-456f-8378-0857ead93aa5' },
//     //   ],
//     //   translateToCurrencies: ['ILS', 'GBP'],
//     // })
//     // itTakeUntil(() => new Promise(resolve => setTimeout(resolve, 4000)))
//   );

//   for await (const updates of iter) {
//     console.log('updates'.toUpperCase(), JSON.stringify(updates, undefined, 2));
//   }
// })();
