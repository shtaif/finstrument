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
      if (!ctx.session.activeUserId) {
        return null;
      }

      const selectedFields = gqlFormattedFieldSelectionTree<MeInfo['user']>(info);

      const { id: _id, __typename: ___typename, ...restSelectedFields } = selectedFields;

      return isEmpty(restSelectedFields)
        ? {
            id: ctx.session.activeUserId,
          }
        : pipe(
            (await UserModel.findByPk(ctx.session.activeUserId, {
              attributes: ['alias'],
            }))!,
            ({ alias }) => ({
              id: ctx.session.activeUserId,
              alias,
            })
          );
    },
  },
} satisfies Resolvers;
