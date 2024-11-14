import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { positionsService } from '../../../utils/positionsService/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Query: {
    lots: authenticatedSessionResolverMiddleware(async (_, args, ctx) => {
      const activeUserId = ctx.activeSession.activeUserId;

      const lots = await positionsService.retrieveLots({
        filters: {
          and: [
            { ownerIds: [activeUserId] },
            {
              or: [
                { ids: args.filters?.ids ?? undefined },
                { symbols: args.filters?.symbols ?? undefined },
              ],
            },
          ],
        },
        pagination: { offset: 0 },
        orderBy: ['openedAt', 'DESC'],
      });

      return lots;
    }),
  },

  Lot: {
    async instrument(lot, _, ctx) {
      // TODO: Add a GraphQL middleware which logs resolver exceptions internally as it catches them

      const instrumentInfo = await ctx.instrumentInfoLoader.load(lot.symbol!);

      return {
        symbol: instrumentInfo.symbol,
        name: instrumentInfo.name, // !!!
        currency: instrumentInfo.currency,
        exchange: {
          acronym: instrumentInfo.exchangeAcronym,
          mic: instrumentInfo.exchangeMic, // !!!
          fullName: instrumentInfo.exchangeFullName,
          countryCode: instrumentInfo.exchangeCountryCode,
        },
      };
    },

    async priceData(lot, _, ctx) {
      const instrumentCurrMarketData = (await ctx.instrumentCurrentMarketDataLoader.load(
        lot.symbol!
      ))!;
      return instrumentCurrMarketData;
    },

    async unrealizedPnl(lot, _, ctx) {
      const currMarketData = (await ctx.lotMarketDataLoader.load(lot.id!))!;
      return {
        amount: currMarketData.pnl.amount,
        percent: currMarketData.pnl.percent,
        // currencyAdjusted: undefined,
      };
    },
  },
} satisfies Resolvers;
