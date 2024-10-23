import { sumBy } from 'lodash-es';
import { type UpdatedSymbolPrice } from './getMarketDataByStatsObjectsIter.js';

export { portfolioStatsCalcMarketStats };

function portfolioStatsCalcMarketStats(
  portfolioStats: {
    totalPresentInvestedAmount: number;
    resolvedHoldings: {
      symbol: string;
      breakEvenPrice: number | null;
      totalQuantity: number;
      totalPresentInvestedAmount: number;
    }[];
  },
  instrumentMarketData: {
    [symbol: string]: Pick<NonNullable<UpdatedSymbolPrice>, 'regularMarketPrice'>;
  }
): {
  marketValue: number;
  pnlAmount: number;
  pnlPercent: number;
} {
  const nonEmptyResolvedHoldings = portfolioStats.resolvedHoldings.filter(
    (holding): holding is typeof holding & { breakEvenPrice: number } => !!holding.breakEvenPrice
  );

  const marketValue = sumBy(
    nonEmptyResolvedHoldings,
    h => h.totalQuantity * instrumentMarketData[h.symbol].regularMarketPrice
  );

  const pnlAmount = sumBy(
    nonEmptyResolvedHoldings,
    h => h.totalQuantity * (instrumentMarketData[h.symbol].regularMarketPrice - h.breakEvenPrice)
  );

  const pnlPercent =
    sumBy(
      nonEmptyResolvedHoldings,
      h =>
        (instrumentMarketData[h.symbol].regularMarketPrice / h.breakEvenPrice - 1) *
        (h.totalPresentInvestedAmount / portfolioStats.totalPresentInvestedAmount)
    ) * 100;

  return { marketValue, pnlAmount, pnlPercent };
}
