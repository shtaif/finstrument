import { compact, identity, pickBy, keys } from 'lodash-es';
import { type DeepNonNullable } from 'utility-types';
import { pipe, CustomError } from 'shared-utils';
import { itMap, itTap } from 'iterable-operators';
import {
  marketDataService,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from '../marketDataService/index.js';
import { type StatsObjectChanges } from '../observeStatsObjectChanges/index.js';

export { getMarketDataByStatsObjectsIter, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

function getMarketDataByStatsObjectsIter(params: {
  statsObjects: AsyncIterable<StatsObjectChanges['current']>;
  translateToCurrencies?: string[];
  ignoreClosedObjectStats?: boolean;
}): AsyncIterable<UpdatedSymbolPriceMap<string>> {
  const paramsNorm = {
    statsObjects: params.statsObjects,
    translateToCurrencies: params.translateToCurrencies ?? [],
    ignoreClosedObjectStats: params.ignoreClosedObjectStats ?? false,
  };

  return pipe(
    paramsNorm.statsObjects,
    itMap(currStats => ({
      portfolioStatsChanges: Object.values(currStats.portfolioStats),
      holdingStatsChanges: Object.values(currStats.holdingStats),
      lotChanges: Object.values(currStats.lots),
    })),
    !paramsNorm.ignoreClosedObjectStats
      ? identity
      : itMap(({ portfolioStatsChanges, holdingStatsChanges, lotChanges }) =>
          pipe(
            [
              portfolioStatsChanges.filter(p => p.totalPresentInvestedAmount > 0),
              holdingStatsChanges.filter(h => h.totalLotCount > 0),
              lotChanges.filter(p => p.remainingQuantity > 0),
            ],
            ([nonEmptyPortfolioStatsChanges, nonEmptyHoldingStatsChanges, nonClosedLots]) => ({
              portfolioStatsChanges: nonEmptyPortfolioStatsChanges,
              holdingStatsChanges: nonEmptyHoldingStatsChanges,
              lotChanges: nonClosedLots,
            })
          )
        ),
    itMap(({ portfolioStatsChanges, holdingStatsChanges, lotChanges }) => {
      const targetSymbols = [
        ...portfolioStatsChanges.flatMap(p => p.resolvedHoldings.map(h => h.symbol)),
        ...holdingStatsChanges.map(h => h.symbol),
        ...lotChanges.map(p => p.symbol),
      ];

      const translateCurrenciesExchangeSymbols = pipe(
        [
          ...portfolioStatsChanges.map(p => p.forCurrency),
          ...holdingStatsChanges.map(h => h.symbolInfo.currency),
          ...lotChanges.map(p => p.symbolInfo.currency),
        ],
        compact,
        $ =>
          $.flatMap(originCurrency =>
            paramsNorm.translateToCurrencies
              .filter(transCurrency => transCurrency !== originCurrency)
              .map(transCurrency => `${originCurrency}${transCurrency}=X`)
          )
      );

      return [...targetSymbols, ...translateCurrenciesExchangeSymbols].toSorted();
    }),
    symbolsIter => marketDataService.observeMarketData({ symbols: symbolsIter }),
    itTap(changedSymbols => {
      const symbolsNotFound = pipe(
        pickBy(changedSymbols, changedSymbol => changedSymbol === null),
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
    })
    // itShare()
  );
}
