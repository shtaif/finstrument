import { isEmpty } from 'lodash-es';
import { pipe } from 'shared-utils';
import { UserModel } from '../../../db/index.js';
import { type Resolvers, type MeInfo } from '../../../generated/graphql-schema.d.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';

export { resolvers };

const resolvers = {
  Query: {
    me: () => ({}),
  },

  MeInfo: {
    user: async (_parent, _args, ctx, info) => {
      const activeUserId = (await ctx.getSession()).activeUserId;

      if (!activeUserId) {
        return null;
      }

      const {
        id: _id,
        __typename: ___typename,
        ...restSelectedFields
      } = gqlFormattedFieldSelectionTree<MeInfo['user']>(info);

      return isEmpty(restSelectedFields)
        ? {
            id: activeUserId,
          }
        : pipe(
            (await UserModel.findByPk(activeUserId, {
              attributes: ['alias'],
            }))!,
            ({ alias }) => ({
              id: activeUserId,
              alias,
            })
          );
    },
  },
} satisfies Resolvers;
