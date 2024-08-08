import { compact } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import type { Resolvers, Subscription } from '../../../generated/graphql-schema.d.js';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { type PortfolioObjectSpecifier } from '../../../utils/observeStatsObjectChanges/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';

export { resolvers };

const resolvers = {
  Subscription: {
    portfolioStats: {
      subscribe: async (_, _args, ctx, info) => {
        const activeUserId = (await ctx.getSession()).activeUserId!;

        const requestedFields =
          gqlFormattedFieldSelectionTree<Subscription['portfolioStats']>(info);

        const specifiers = [
          {
            type: 'PORTFOLIO' as const,
            portfolioOwnerId: activeUserId,
            statsCurrency: undefined,
          },
        ] satisfies PortfolioObjectSpecifier[];

        const translateCurrency =
          requestedFields.data?.subFields.unrealizedPnl?.subFields.currencyAdjusted?.args.currency;

        return pipe(
          getLiveMarketData({
            specifiers,
            translateToCurrencies: compact([translateCurrency]),
            fields: {
              portfolios: {
                type: !!requestedFields.type,
                portfolio: pipe(requestedFields.data?.subFields, fields => ({
                  relatedTradeId: !!fields?.relatedTradeId,
                  ownerId: !!fields?.ownerId,
                  forCurrency: !!fields?.forCurrency,
                  totalPresentInvestedAmount: !!fields?.totalPresentInvestedAmount,
                  totalRealizedAmount: !!fields?.totalRealizedAmount,
                  totalRealizedProfitOrLossAmount: !!fields?.totalRealizedProfitOrLossAmount,
                  totalRealizedProfitOrLossRate: !!fields?.totalRealizedProfitOrLossRate,
                  lastChangedAt: !!fields?.lastChangedAt,
                })),
                pnl: pipe(requestedFields.data?.subFields.unrealizedPnl?.subFields, fields => ({
                  amount: !!fields?.amount,
                  percent: !!fields?.percent,
                  byTranslateCurrencies: pipe(fields?.currencyAdjusted?.subFields, fields => ({
                    amount: !!fields?.amount,
                    currency: !!fields?.currency,
                    exchangeRate: !!fields?.exchangeRate,
                  })),
                })),
              },
            },
          }),
          itMap(updates =>
            updates.portfolios.map(({ type, portfolio, pnl }) => ({
              type,
              data: {
                ...portfolio,
                unrealizedPnl: !pnl
                  ? undefined
                  : {
                      percent: pnl.percent,
                      amount: pnl.amount,
                      currencyAdjusted: pnl.byTranslateCurrencies?.[0],
                    },
              },
            }))
          ),
          itMap(relevantPStatsUpdates => ({
            portfolioStats: relevantPStatsUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
