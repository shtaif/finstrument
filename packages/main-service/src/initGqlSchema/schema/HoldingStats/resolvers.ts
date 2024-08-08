import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { positionsService } from '../../../utils/positionsService/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Query: {
    holdingStats: authenticatedSessionResolverMiddleware(async (_, args, ctx) => {
      // const requestedCurrentPortfolioPortion = !!requestedFields.currentPortfolioPortion;
      // TODO: ⤴️ ...

      const holdingStats = await positionsService.retrieveHoldingStats({
        filters: {
          ownerIds: [ctx.activeSession.activeUserId!],
          symbols: args.filters?.symbols ?? [],
        },
        pagination: { offset: 0 },
        orderBy: ['lastChangedAt', 'DESC'],
      });

      return holdingStats;
    }),
  },

  HoldingStats: {
    async relatedPortfolioStats(holdingStats, _, ctx) {
      const requestedFields = {} as any;

      const portfolioStats = await ctx.portfolioStatsLoader.load({
        ownerId: holdingStats.ownerId!,
        includeCompositions: !!requestedFields.composition,
      });

      return portfolioStats;
    },

    async instrument(holdingStats, _, ctx) {
      const instrumentInfo = await ctx.instrumentInfoLoader.load(holdingStats.symbol!);

      // TODO: Add a GraphQL middleware which logs resolver exceptions internally as it catches them

      return {
        symbol: instrumentInfo.symbol,
        name: instrumentInfo.name,
        currency: instrumentInfo.currency,
        exchange: {
          acronym: instrumentInfo.exchangeAcronym,
          mic: instrumentInfo.exchangeMic,
          fullName: instrumentInfo.exchangeFullName,
          countryCode: instrumentInfo.exchangeCountryCode,
        },
      };
    },

    unrealizedPnl: authenticatedSessionResolverMiddleware(async (holdingStats, _, ctx) => {
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: ctx.activeSession.activeUserId!,
        symbol: holdingStats.symbol!,
      });
      return {
        amount: currMarketData.pnl.amount,
        percent: currMarketData.pnl.percent,
      };
    }),
  },
} satisfies Resolvers;
