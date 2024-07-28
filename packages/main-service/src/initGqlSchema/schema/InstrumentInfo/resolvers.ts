import { type Resolvers } from '../../../generated/graphql-schema.d.js';

export { resolvers };

const resolvers = {
  InstrumentInfo: {
    async marketState(instrumentInfo, _, ctx) {
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: ctx.activeUser.id,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.marketState;
    },

    async regularMarketTime(instrumentInfo, _, ctx) {
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: ctx.activeUser.id,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.regularMarketTime;
    },

    async regularMarketPrice(instrumentInfo, _, ctx) {
      const currMarketData = await ctx.holdingMarketDataLoader.load({
        ownerId: ctx.activeUser.id,
        symbol: instrumentInfo.symbol!,
      });
      return currMarketData.priceData.regularMarketPrice;
    },
  },
} satisfies Resolvers;
