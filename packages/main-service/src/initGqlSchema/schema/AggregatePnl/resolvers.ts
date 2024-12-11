import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { type Resolvers } from '../../../generated/graphql-schema.d.js';
import { getAggregateLiveMarketData } from '../../../utils/getAggregateLiveMarketData/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Subscription: {
    aggregatePnl: {
      subscribe: authenticatedSessionResolverMiddleware((_, args, ctx) => {
        const translatedAggregatesFieldArgsGiven = {} as any;

        return pipe(
          getAggregateLiveMarketData({
            specifiers: [
              ...(args.holdings ?? []).map(({ symbol }) => ({
                type: 'POSITION' as const,
                holdingSymbol: symbol,
                holdingPortfolioOwnerId: ctx.activeSession.activeUserId,
              })),
              ...(args.lots ?? []).map(({ lotId }) => ({
                type: 'LOT' as const,
                lotId,
                // TODO: Add a possible `lotOwnerId` property to be sent along the `lotId` so it could be scoped to a particular user so that their visibility is then enforced by ownership
              })),
            ],
            translateToCurrencies: translatedAggregatesFieldArgsGiven?.currencies,
          }),
          itMap(update => ({
            aggregatePnl: {
              aggregates: update.nativeCurrencies.map(({ nativeCurrency, pnl }) => ({
                currency: nativeCurrency,
                pnlAmount: pnl.amount,
                pnlPercent: pnl.rate * 100,
              })),
              translatedAggregates: update.translateCurrencies.map(
                ({ translateCurrency, pnl }) => ({
                  currency: translateCurrency,
                  pnlAmount: pnl.amount,
                })
              ),
            },
          }))
        );
      }),
    },
  },

  AggregatePnlChangeResult: {},
} satisfies Resolvers;
