import { GraphQLError } from 'graphql';
import { type AppGqlContextValue } from '../appGqlContext.js';
import { type OptionallyPromise } from '../../utils/OptionallyPromise.js';

export { authenticatedSessionResolverMiddleware };

function authenticatedSessionResolverMiddleware<
  TOutputResolverArgs extends [
    parent: unknown,
    args: unknown,
    ctx: Pick<AppGqlContextValue, 'getSession'>,
    info: unknown,
  ],
  TOutputResolverReturn,
>(
  inputResolver: (
    ...args: [
      parent: TOutputResolverArgs[0],
      args: TOutputResolverArgs[1],
      ctxModified: TOutputResolverArgs[2] & { activeSession: { activeUserId: string } },
      info: TOutputResolverArgs[3],
    ]
  ) => OptionallyPromise<TOutputResolverReturn>
): (...args: TOutputResolverArgs) => Promise<TOutputResolverReturn> {
  return async (parent, args, ctx, info) => {
    const { activeUserId } = await ctx.getSession();
    if (!activeUserId) {
      throw new GraphQLError('Must provide a valid session token in order to retrieve this field', {
        extensions: {
          type: 'AUTHENTICATION_REQUIRED',
        },
      });
    }
    const ctxModified = {
      ...ctx,
      activeSession: { activeUserId },
    };
    return await inputResolver(parent, args, ctxModified, info);
  };
}
