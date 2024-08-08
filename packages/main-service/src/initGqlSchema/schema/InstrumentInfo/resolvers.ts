import { CustomError } from 'shared-utils';
import { type Resolvers } from '../../../generated/graphql-schema.d.js';

export { resolvers };

// TODO: The `InstrumentInfo` schema's market data fields are defined *non-nullable* (at time of writing this), therefore we have those thrown exceptions below (which shouldn't and aren't intended to be reflected to the requestor plainly). Should probably consider rethink if this is really suitable and whether they should not be non-nullable with all the implications.

const resolvers = {
  InstrumentInfo: {
    async marketState(instrumentInfo, _, ctx) {
      const currMarketData =
        (await ctx.instrumentCurrentMarketDataLoader.load(instrumentInfo.symbol!)) ??
        (() => {
          throw new CustomError({
            message: `Couldn't find market data for symbol "${instrumentInfo.symbol!}"`,
          });
        })();
      return currMarketData.marketState;
    },

    async regularMarketTime(instrumentInfo, _, ctx) {
      const currMarketData =
        (await ctx.instrumentCurrentMarketDataLoader.load(instrumentInfo.symbol!)) ??
        (() => {
          throw new CustomError({
            message: `Couldn't find market data for symbol "${instrumentInfo.symbol!}"`,
          });
        })();
      return currMarketData.regularMarketTime;
    },

    async regularMarketPrice(instrumentInfo, _, ctx) {
      const currMarketData =
        (await ctx.instrumentCurrentMarketDataLoader.load(instrumentInfo.symbol!)) ??
        (() => {
          throw new CustomError({
            message: `Couldn't find market data for symbol "${instrumentInfo.symbol!}"`,
          });
        })();
      return currMarketData.regularMarketPrice;
    },
  },
} satisfies Resolvers;
