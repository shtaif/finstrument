import { compact, identity, pickBy, keys } from 'lodash-es';
import { type DeepNonNullable } from 'utility-types';
import { pipe, CustomError } from 'shared-utils';
import { itMap, itTap } from 'iterable-operators';
import {
  marketDataService,
  type UpdatedSymbolPriceMap,
  type UpdatedSymbolPrice,
} from '../marketDataService/index.js';
import { type StatsObjectChanges2 } from '../observeStatsObjectChanges/index.js';

export { getSymbolMarketDataIter, type UpdatedSymbolPriceMap, type UpdatedSymbolPrice };

function getSymbolMarketDataIter(params: {
  statsObjects: AsyncIterable<StatsObjectChanges2['current']>;
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
      positionChanges: Object.values(currStats.positions),
    })),
    !paramsNorm.ignoreClosedObjectStats
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
        ...portfolioStatsChanges.flatMap(p => p.resolvedHoldings.map(h => h.symbol)),
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
