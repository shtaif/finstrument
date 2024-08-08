import { UserModel } from '../../../db/index.js';
import type { Resolvers } from '../../../generated/graphql-schema.d.ts';
import { positionsService } from '../../../utils/positionsService/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Mutation: {
    setTrades: authenticatedSessionResolverMiddleware(async (_, args, ctx) => {
      const { alias } = (await UserModel.findOne({
        where: { id: ctx.activeSession.activeUserId },
        attributes: ['alias'],
      }))!;

      const { tradesAddedCount, tradesModifiedCount, tradesRemovedCount } =
        await positionsService.setPositions({
          mode: args.input.mode,
          ownerAlias: alias,
          csvData: args.input.data.csv,
        });

      return {
        tradesAddedCount,
        tradesModifiedCount,
        tradesRemovedCount,
      };
    }),
  },
} satisfies Resolvers;
