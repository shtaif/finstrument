import { compact } from 'lodash-es';
import { type DeepNonNullable } from 'utility-types';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import type { Resolvers, Subscription } from '../../../generated/graphql-schema.d.js';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';
import { type AppGqlContextValue } from '../../appGqlContext.js';

export { resolvers };

const resolvers = {
  Subscription: {
    positions: {
      subscribe(_, args, _ctx, info) {
        // TODO: Modify this resolver so it doesn't just target the given position IDs directly, but rather adds also a condition for their owner to be the actual requestor

        const requestedFields = gqlFormattedFieldSelectionTree<Subscription['positions']>(info);

        const specifiers = args.filters.ids.map(id => ({
          type: 'POSITION' as const,
          positionId: id,
        }));

        const translateCurrency =
          requestedFields.data?.subFields.unrealizedPnl?.subFields.currencyAdjusted?.args.currency;

        return pipe(
          getLiveMarketData({
            specifiers,
            translateToCurrencies: compact([translateCurrency]),
            fields: {
              positions: {
                type: !!requestedFields.type,
                position: pipe(requestedFields.data?.subFields, fields => ({
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
            updates.positions.map(({ type, position, priceData, pnl }) => ({
              type,
              data: {
                ...position,
                priceData,
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
          itMap(relevantPositionUpdates => ({
            positions: relevantPositionUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
