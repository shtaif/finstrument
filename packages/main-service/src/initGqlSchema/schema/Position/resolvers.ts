import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { positionsService } from '../../../utils/positionsService/index.js';

export { resolvers };

const resolvers = {
  Query: {
    async positions(_, args, ctx) {
      const positions = await positionsService.retrievePositions({
        filters: {
          and: [
            { ownerIds: [ctx.activeUser.id] },
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

      return positions;
    },
  },

  Position: {
    async instrument(position, _, ctx) {
      // TODO: Add a GraphQL middleware which logs resolver exceptions internally as it catches them

      const instrumentInfo = await ctx.instrumentInfoLoader.load(position.symbol!);

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

    async priceData(position, _, ctx) {
      const instrumentCurrMarketData = (await ctx.instrumentCurrentMarketDataLoader.load(
        position.symbol!
      ))!;
      return instrumentCurrMarketData;
    },

    async unrealizedPnl(position, _, ctx) {
      const currMarketData = (await ctx.positionMarketDataLoader.load(position.id!))!;
      return {
        amount: currMarketData.pnl.amount,
        percent: currMarketData.pnl.percent,
        // currencyAdjusted: undefined,
      };
    },
  },
} satisfies Resolvers;
