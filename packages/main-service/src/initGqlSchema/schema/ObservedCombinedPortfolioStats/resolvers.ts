import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { type Resolvers, type Subscription } from '../../../generated/graphql-schema.d.js';
import { observeCombinedPortfolioStats } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Subscription: {
    combinedPortfolioStats: {
      subscribe: authenticatedSessionResolverMiddleware(async (_, args, ctx, info) => {
        const requestedFields =
          gqlFormattedFieldSelectionTree<Subscription['combinedPortfolioStats']>(info);

        return pipe(
          observeCombinedPortfolioStats({
            portfolioOwnerIds: [ctx.activeSession.activeUserId],
            currencyToCombineIn: args.currencyToCombineIn,
            fields: {
              ownerId: !!requestedFields.ownerId,
              currencyCombinedBy: !!requestedFields.currencyCombinedBy,
              mostRecentTradeId: !!requestedFields.mostRecentTradeId,
              lastChangedAt: !!requestedFields.lastChangedAt,
              costBasis: !!requestedFields.costBasis,
              realizedAmount: !!requestedFields.realizedAmount,
              realizedPnlAmount: !!requestedFields.realizedPnlAmount,
              realizedPnlRate: !!requestedFields.realizedPnlRate,
              unrealizedPnlAmount: !!requestedFields.unrealizedPnl?.subFields.amount,
              unrealizedPnlFraction: !!requestedFields.unrealizedPnl?.subFields.fraction,
              marketValue: !!requestedFields.marketValue,
              compositionByHoldings: {
                symbol: !!requestedFields.compositionByHoldings?.subFields.symbol,
                portionOfPortfolioCostBasis:
                  !!requestedFields.compositionByHoldings?.subFields.portionOfPortfolioCostBasis,
                portionOfPortfolioUnrealizedPnl:
                  !!requestedFields.compositionByHoldings?.subFields
                    .portionOfPortfolioUnrealizedPnl,
                portionOfPortfolioMarketValue:
                  !!requestedFields.compositionByHoldings?.subFields.portionOfPortfolioMarketValue,
              },
            },
          }),
          itMap(([ownPortfolio]) => {
            ownPortfolio.realizedPnlAmount;
            const { unrealizedPnlAmount, unrealizedPnlFraction, ...rest } = ownPortfolio;
            return {
              ...rest,
              unrealizedPnl: {
                amount: unrealizedPnlAmount,
                fraction: unrealizedPnlFraction,
              },
            };
          }),
          itMap(ownPortfolio => ({
            combinedPortfolioStats: ownPortfolio,
          }))
        );
      }),
    },
  },
} satisfies Resolvers;
