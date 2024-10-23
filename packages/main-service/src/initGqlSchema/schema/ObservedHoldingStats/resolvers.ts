import { compact } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { type Resolvers, type Subscription } from '../../../generated/graphql-schema.d.js';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Subscription: {
    holdingStats: {
      resolve: undefined,
      subscribe: authenticatedSessionResolverMiddleware((_, args, ctx, info) => {
        const requestedFields = gqlFormattedFieldSelectionTree<Subscription['holdingStats']>(info);

        const specifiers = args.filters?.symbols?.length
          ? args.filters.symbols.map(symbol => ({
              type: 'HOLDING' as const,
              holdingPortfolioOwnerId: ctx.activeSession.activeUserId,
              holdingSymbol: symbol,
            }))
          : [
              {
                type: 'HOLDING' as const,
                holdingPortfolioOwnerId: ctx.activeSession.activeUserId,
              },
            ];

        const translateCurrency =
          requestedFields.data?.subFields.unrealizedPnl?.subFields.currencyAdjusted?.args.currency;

        return pipe(
          getLiveMarketData({
            specifiers,
            translateToCurrencies: compact([translateCurrency]),
            fields: {
              holdings: {
                type: !!requestedFields.type,
                holding: pipe(requestedFields.data?.subFields, fields => ({
                  symbol: !!fields?.symbol,
                  ownerId: !!fields?.ownerId,
                  lastRelatedTradeId: !!fields?.lastRelatedTradeId,
                  totalLotCount: !!fields?.totalLotCount,
                  totalQuantity: !!fields?.totalQuantity,
                  totalPresentInvestedAmount: !!fields?.totalPresentInvestedAmount,
                  totalRealizedAmount: !!fields?.totalRealizedAmount,
                  totalRealizedProfitOrLossAmount: !!fields?.totalRealizedProfitOrLossAmount,
                  totalRealizedProfitOrLossRate: !!fields?.totalRealizedProfitOrLossRate,
                  currentPortfolioPortion: !!fields?.currentPortfolioPortion,
                  breakEvenPrice: !!fields?.breakEvenPrice,
                  lastChangedAt: !!fields?.lastChangedAt,
                })),
                priceData: pipe(requestedFields.data?.subFields.priceData?.subFields, fields => ({
                  currency: !!fields?.currency,
                  marketState: !!fields?.marketState,
                  regularMarketTime: !!fields?.regularMarketTime,
                  regularMarketPrice: !!fields?.regularMarketPrice,
                })),
                marketValue: !!requestedFields.data?.subFields.marketValue,
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
            updates.holdings.map(({ type, holding, priceData, marketValue, pnl }) => ({
              type,
              data: {
                ...holding,
                priceData,
                marketValue,
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
          itMap(relevantHoldingUpdates => ({
            holdingStats: relevantHoldingUpdates,
          }))
        );
      }),
    },
  },
} satisfies Resolvers;
