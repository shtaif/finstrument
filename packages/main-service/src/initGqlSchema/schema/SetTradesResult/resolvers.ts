import { UserModel } from '../../../db/index.js';
import type { Resolvers } from '../../../generated/graphql-schema.d.ts';
import { positionsService } from '../../../utils/positionsService/index.js';

export { resolvers };

const resolvers = {
  Mutation: {
    async setTrades(_, args, ctx) {
      const user = (await UserModel.findOne({
        where: { id: (await ctx.getSession()).activeUserId! },
        attributes: ['alias'],
      }))!;

      const { tradesAddedCount, tradesModifiedCount, tradesRemovedCount } =
        await positionsService.setPositions({
          mode: args.input.mode,
          ownerAlias: user.alias,
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
