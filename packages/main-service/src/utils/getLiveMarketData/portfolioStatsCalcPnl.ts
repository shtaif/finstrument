import { type UpdatedSymbolPrice } from './getMarketDataByStatsObjectsIter.js';

export { portfolioStatsCalcPnl };

function portfolioStatsCalcPnl(
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
  pnlAmount: number;
  pnlPercent: number;
} {
  const nonEmptyResolvedHoldings = portfolioStats.resolvedHoldings.filter(
    (holding): holding is typeof holding & { breakEvenPrice: number } => !!holding.breakEvenPrice
  );

  const pnlAmount = nonEmptyResolvedHoldings
    .map(
      h => (instrumentMarketData[h.symbol].regularMarketPrice - h.breakEvenPrice) * h.totalQuantity
    )
    .reduce((acc, holdingPnlAmount) => acc + holdingPnlAmount, 0);

  const pnlPercent =
    nonEmptyResolvedHoldings.reduce(
      (acc, holding) =>
        acc +
        (instrumentMarketData[holding.symbol].regularMarketPrice / holding.breakEvenPrice - 1) *
          (holding.totalPresentInvestedAmount / portfolioStats.totalPresentInvestedAmount),
      0
    ) * 100;

  return { pnlAmount, pnlPercent };
}
