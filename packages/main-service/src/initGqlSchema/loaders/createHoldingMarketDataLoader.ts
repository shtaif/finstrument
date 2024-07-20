import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import { keyBy, groupBy, mapValues } from 'lodash';
import {
  getLiveMarketData,
  type HoldingMarketStatsUpdate,
} from '../../utils/getLiveMarketData/index.js';

export { createHoldingMarketDataLoader, type HoldingMarketStatsUpdate };

function createHoldingMarketDataLoader(): DataLoader<
  { ownerId: string; symbol: string },
  HoldingMarketStatsUpdate<true, true>
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
          include: {
            priceData: true,
            unrealizedPnl: true,
          },
        }),
        itTakeFirst()
      ))!;

      const marketDatasByOwnerIdsAndSymbols: {
        [ownerId: string]: {
          [symbol: string]: HoldingMarketStatsUpdate<true, true>;
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
