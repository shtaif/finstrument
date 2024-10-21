import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import { keyBy, groupBy, mapValues } from 'lodash-es';
import {
  getLiveMarketData,
  type HoldingMarketStatsUpdate,
} from '../../utils/getLiveMarketData/index.js';

export { createHoldingMarketDataLoader, type HoldingMarketStats };

function createHoldingMarketDataLoader(): DataLoader<
  { ownerId: string; symbol: string },
  HoldingMarketStats
> {
  return new DataLoader(
    async inputs => {
      const currMarketData = (await pipe(
        getLiveMarketData({
          specifiers: inputs.map(input => ({
            type: 'HOLDING',
            holdingPortfolioOwnerId: input.ownerId,
            holdingSymbol: input.symbol,
          })),
          fields: {
            holdings: {
              holding: {
                symbol: true,
                ownerId: true,
                lastRelatedTradeId: true,
                totalLotCount: true,
                totalQuantity: true,
                totalPresentInvestedAmount: true,
                totalRealizedAmount: true,
                totalRealizedProfitOrLossAmount: true,
                totalRealizedProfitOrLossRate: true,
                currentPortfolioPortion: true,
                breakEvenPrice: true,
                lastChangedAt: true,
              },
              priceData: {
                currency: true,
                marketState: true,
                regularMarketTime: true,
                regularMarketPrice: true,
              },
              pnl: {
                amount: true,
                percent: true,
              },
            },
          },
        }),
        itTakeFirst()
      ))!;

      const marketDatasByOwnerIdsAndSymbols: {
        [ownerId: string]: {
          [symbol: string]: HoldingMarketStats;
        };
      } = pipe(
        groupBy(currMarketData.holdings, ({ holding }) => holding.ownerId),
        v => mapValues(v, marketDatas => keyBy(marketDatas, ({ holding }) => holding.symbol))
      );

      return inputs.map(({ ownerId, symbol }) => marketDatasByOwnerIdsAndSymbols[ownerId][symbol]);
    },
    {
      cacheKeyFn: ({ ownerId, symbol }) => `${ownerId}_${symbol}`,
    }
  );
}

type HoldingMarketStats = {
  holding: HoldingMarketStatsUpdate['holding'];
  priceData: HoldingMarketStatsUpdate['priceData'];
  pnl: {
    amount: HoldingMarketStatsUpdate['pnl']['amount'];
    percent: HoldingMarketStatsUpdate['pnl']['percent'];
  };
};
