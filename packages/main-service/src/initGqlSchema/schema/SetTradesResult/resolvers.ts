import type { Resolvers } from '../../../generated/graphql-schema.d.ts';
import { positionsService } from '../../../utils/positionsService/index.js';

export { resolvers };

const resolvers = {
  Mutation: {
    async setTrades(_, args, ctx) {
      const { tradesAddedCount, tradesModifiedCount, tradesRemovedCount } =
        await positionsService.setPositions({
          mode: args.input.mode,
          ownerAlias: ctx.activeUser.alias,
          csvData: args.input.data.csv,
        });

      return {
        tradesAddedCount,
        tradesModifiedCount,
        tradesRemovedCount,
      };
    },
  },
} satisfies Resolvers;
