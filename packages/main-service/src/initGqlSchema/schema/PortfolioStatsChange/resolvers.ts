// import { parseResolveInfo } from 'graphql-parse-resolve-info';
// import { pipe } from 'shared-utils';
import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import positionsService from '../../../utils/positionsService/index.js';

export { resolvers };

const resolvers = {
  Query: {
    async portfolioStatsChanges(_, _args, ctx, info) {
      // const requestedFields = pipe(parseResolveInfo(info)!.fieldsByTypeName, Object.values)[0];
      // const requestedFields = {} as any;

      const portfolioStatsChange = await positionsService.retrievePortfolioStatsChanges({
        // includeCompositions: !!requestedFields.composition,
        filters: { ownerIds: [ctx.session.activeUserId!] },
        pagination: { offset: 0 },
        orderBy: ['changedAt', 'DESC'],
      });

      return portfolioStatsChange;
    },
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
