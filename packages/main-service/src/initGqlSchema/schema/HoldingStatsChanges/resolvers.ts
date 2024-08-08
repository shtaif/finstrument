// import { parseResolveInfo } from 'graphql-parse-resolve-info';
import { pipe } from 'shared-utils';
import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { positionsService } from '../../../utils/positionsService/index.js';

export { resolvers };

const resolvers = {
  Query: {
    async holdingStatsChanges(_, args, ctx, info) {
      // const requestedFields = pipe(parseResolveInfo(info)!.fieldsByTypeName, Object.values)[0];
      const requestedFields = {} as any;
      const requestedPortfolioPortion = !!requestedFields.portfolioPortion; // TODO: ...

      const holdingStatsChanges = await positionsService.retrieveHoldingStatsChanges({
        filters: {
          ownerIds: [(await ctx.getSession()).activeUserId!],
          symbols: args.filters?.symbols ?? [],
        },
        pagination: { offset: 0 },
        orderBy: ['changedAt', 'DESC'],
      });

      return holdingStatsChanges;
    },
  },

  HoldingStatsChange: {
    async relatedPortfolioStatsChange(holdingStats, _args, ctx, info) {
      // const requestedFields = pipe(parseResolveInfo(info)!.fieldsByTypeName, Object.values)[0];
      const requestedFields = {} as any;

      const derivedPortfolioStatsChange = await ctx.portfolioStatsChangesLoader.load({
        relatedTradeId: holdingStats.relatedTradeId!,
        includeCompositions: !!requestedFields.composition,
      });

      return derivedPortfolioStatsChange;
    },
  },
} satisfies Resolvers;
