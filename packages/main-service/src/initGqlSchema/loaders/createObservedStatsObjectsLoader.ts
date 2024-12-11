import { pipe } from 'shared-utils';
import { myIterableCleanupPatcher } from 'iterable-operators';
import DataLoader from 'dataloader';
import {
  getLiveMarketData,
  type HoldingMarketStatsUpdate,
} from '../../utils/getLiveMarketData/index.js';

export { createObservedStatsObjectsLoader, type HoldingMarketStatsUpdate };

function createObservedStatsObjectsLoader(): DataLoader<
  { ownerId: string; symbol: string },
  AsyncIterable<HoldingMarketStatsUpdate>
> {
  return new DataLoader(async inputs => {
    const holdingMarketStats = getLiveMarketData({
      specifiers: inputs.map(input => ({
        type: 'POSITION',
        holdingPortfolioOwnerId: input.ownerId,
        holdingSymbol: input.symbol,
      })),
      fields: {
        holdings: {
          type: true,
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
          marketValue: true,
          pnl: {
            amount: true,
            percent: true,
            byTranslateCurrencies: {
              amount: true,
              currency: true,
              exchangeRate: true,
            },
          },
        },
      },
    });

    return inputs.map(({ ownerId, symbol }) =>
      pipe(
        holdingMarketStats,
        myIterableCleanupPatcher(async function* (source) {
          for await (const updates of source) {
            const matchingUpdate = updates.holdings.find(
              ({ holding }) => holding.ownerId === ownerId && holding.symbol === symbol
            );
            if (matchingUpdate) {
              yield matchingUpdate;
            }
          }
        })
      )
    );
  });
}
