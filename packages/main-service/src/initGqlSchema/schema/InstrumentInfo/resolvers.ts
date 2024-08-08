import { type Resolvers } from '../../../generated/graphql-schema.d.js';

export { resolvers };

const resolvers = {
  InstrumentInfo: {
    async marketState(instrumentInfo, _, ctx) {
      const activeUserId = (await ctx.getSession()).activeUserId!;
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: activeUserId,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.marketState;
    },

    async regularMarketTime(instrumentInfo, _, ctx) {
      const activeUserId = (await ctx.getSession()).activeUserId!;
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: activeUserId,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.regularMarketTime;
    },

    async regularMarketPrice(instrumentInfo, _, ctx) {
      const activeUserId = (await ctx.getSession()).activeUserId!;
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: activeUserId,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.regularMarketPrice;
    },
  },
} satisfies Resolvers;
