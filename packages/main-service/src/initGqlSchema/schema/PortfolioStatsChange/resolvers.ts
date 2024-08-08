import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import positionsService from '../../../utils/positionsService/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Query: {
    portfolioStatsChanges: authenticatedSessionResolverMiddleware(async (_, _args, ctx) => {
      // const requestedFields = {} as any;

      const portfolioStatsChange = await positionsService.retrievePortfolioStatsChanges({
        // includeCompositions: !!requestedFields.composition,
        filters: { ownerIds: [ctx.activeSession.activeUserId] },
        pagination: { offset: 0 },
        orderBy: ['changedAt', 'DESC'],
      });

      return portfolioStatsChange;
    }),
  },

  PortfolioStatsChange: {
    async relatedHoldingStatsChange(portfolioStats, _, ctx) {
      const holdingStatsChange = await ctx.holdingStatsChangesLoader.load(
        portfolioStats.relatedTradeId!
      );
      return holdingStatsChange;
    },
  },
} satisfies Resolvers;
