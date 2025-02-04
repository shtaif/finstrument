import { compact } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import type { Resolvers, Subscription } from '../../../generated/graphql-schema.js';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';
import { authenticatedSessionResolverMiddleware } from '../../resolverMiddleware/authenticatedSessionResolverMiddleware.js';

export { resolvers };

const resolvers = {
  Subscription: {
    lots: {
      subscribe: authenticatedSessionResolverMiddleware((_, args, _ctx, info) => {
        // TODO: Modify this resolver so it doesn't just target the given lot IDs directly, but rather adds also a condition for their owner to be the actual requestor

        const requestedFields = gqlFormattedFieldSelectionTree<Subscription['lots']>(info);

        const specifiers = args.filters.ids.map(id => ({
          type: 'LOT' as const,
          lotId: id,
        }));

        const translateCurrency =
          requestedFields.data?.subFields.unrealizedPnl?.subFields.currencyAdjusted?.args.currency;

        return pipe(
          getLiveMarketData({
            specifiers,
            translateToCurrencies: compact([translateCurrency]),
            fields: {
              lots: {
                type: !!requestedFields.type,
                lot: pipe(requestedFields.data?.subFields, fields => ({
                  id: !!fields?.id,
                  ownerId: !!fields?.ownerId,
                  openingTradeId: !!fields?.openingTradeId,
                  symbol: !!fields?.symbol,
                  originalQuantity: !!fields?.originalQuantity,
                  remainingQuantity: !!fields?.remainingQuantity,
                  realizedProfitOrLoss: !!fields?.realizedProfitOrLoss,
                  openedAt: !!fields?.openedAt,
                  recordCreatedAt: !!fields?.recordCreatedAt,
                  recordUpdatedAt: !!fields?.recordUpdatedAt,
                })),
                priceData: pipe(requestedFields.data?.subFields.priceData?.subFields, fields => ({
                  currency: !!fields?.currency,
                  marketState: !!fields?.marketState,
                  regularMarketTime: !!fields?.regularMarketTime,
                  regularMarketPrice: !!fields?.regularMarketPrice,
                  regularMarketChange: !!fields?.regularMarketChange,
                  regularMarketChangeRate: !!fields?.regularMarketChangeRate,
                })),
                marketValue: !!requestedFields.data?.subFields?.marketValue,
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
            updates.lots.map(({ type, lot, priceData, marketValue, pnl }) => ({
              type,
              data: {
                ...lot,
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
          itMap(relevantLotUpdates => ({
            lots: relevantLotUpdates,
          }))
        );
      }),
    },
  },
} satisfies Resolvers;
