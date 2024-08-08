import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { positionsService } from '../../../utils/positionsService/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Query: {
    holdingStatsChanges: authenticatedSessionResolverMiddleware(async (_, args, ctx) => {
      const requestedFields = {} as any;
      const requestedPortfolioPortion = !!requestedFields.portfolioPortion; // TODO: ...

      const holdingStatsChanges = await positionsService.retrieveHoldingStatsChanges({
        filters: {
          ownerIds: [ctx.activeSession.activeUserId!],
          symbols: args.filters?.symbols ?? [],
        },
        pagination: { offset: 0 },
        orderBy: ['changedAt', 'DESC'],
      });

      return holdingStatsChanges;
    }),
  },

  HoldingStatsChange: {
    async relatedPortfolioStatsChange(holdingStats, _args, ctx) {
      const requestedFields = {} as any;

      const derivedPortfolioStatsChange = await ctx.portfolioStatsChangesLoader.load({
        relatedTradeId: holdingStats.relatedTradeId!,
        includeCompositions: !!requestedFields.composition,
      });

      return derivedPortfolioStatsChange;
    },
  },
} satisfies Resolvers;
