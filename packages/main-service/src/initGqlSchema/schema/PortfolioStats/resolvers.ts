// import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import positionsService from '../../../utils/positionsService/index.js';
import { getAggregateLiveMarketData } from '../../../utils/getAggregateLiveMarketData/index.js';

export { resolvers };

const resolvers = {
  Query: {
    async portfolioStats(_, _args, ctx, info) {
      // const requestedFields = pipe(parseResolveInfo(info)!.fieldsByTypeName, Object.values)[0];
      const requestedFields = {} as any;

      const [latestPortfolioStatsChange] = await positionsService.retrievePortfolioStatsChanges({
        filters: {
          ownerIds: [ctx.activeUser.id],
        },
        latestPerOwner: true,
        includeCompositions: !!requestedFields.composition,
        pagination: { offset: 0 },
        orderBy: ['lastChangedAt', 'DESC'],
      });

      return latestPortfolioStatsChange;
    },
  },

  PortfolioStats: {
    // async relatedHoldingStats(portfolioStats, _, ctx) {
    //   const holdingStatsChange = ctx.load
    // },

    async unrealizedPnl(portfolioStats) {
      // TODO: `positionsService.retrieveHoldingStats()` can only retrieve up to 100 holdings - the following needs ALL existing holdings which might be more than this limit on extreme cases

      const result = (await pipe(
        getAggregateLiveMarketData({
          specifiers: [
            {
              type: 'PORTFOLIO',
              portfolioOwnerId: portfolioStats.ownerId!,
              statsCurrency: portfolioStats.forCurrency!,
            },
          ],
        }),
        itTakeFirst()
      ))!.nativeCurrencies[0];

      return {
        amount: result.pnl.amount,
        percent: result.pnl.rate * 100,
      };
    },
  },
} satisfies Resolvers;
