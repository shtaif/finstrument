import { intersection, isEqual } from 'lodash';
import { pipe, typedObjectKeys } from 'shared-utils';
import { itFilter, itLazyDefer, itMap, myIterableCleanupPatcher } from 'iterable-operators';
import { type Optional } from 'utility-types';
import type {
  Resolvers,
  Subscription,
  ObservedHoldingStats,
} from '../../../generated/graphql-schema.d.ts';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';

export { resolvers };

const resolvers = {
  Subscription: {
    holdingStats: {
      subscribe(_, args, ctx, info) {
        const observableFields = [
          'breakEvenPrice',
          'currentPortfolioPortion',
          'lastChangedAt',
          'lastRelatedTradeId',
          'totalPositionCount',
          'totalPresentInvestedAmount',
          'totalQuantity',
          'totalRealizedAmount',
          'totalRealizedProfitOrLossAmount',
          'totalRealizedProfitOrLossRate',
          'priceData',
          'unrealizedPnl',
          // 'unrealizedPnl.amount',
          // 'unrealizedPnl.percent',
          // 'unrealizedPnl.currencyAdjusted',
        ] as const satisfies (keyof Subscription['holdingStats'][number]['data'])[];

        const requestedFields = gqlFormattedFieldSelectionTree<Subscription['holdingStats']>(info);

        const requestedObservableFields = intersection(
          observableFields,
          typedObjectKeys(requestedFields.data.subFields)
        ) as typeof observableFields;

        const specifiers = args.filters?.symbols?.length
          ? args.filters.symbols.map(symbol => ({
              type: 'HOLDING' as const,
              holdingPortfolioOwnerId: ctx.activeUser.id,
              holdingSymbol: symbol,
            }))
          : [
              {
                type: 'HOLDING' as const,
                holdingPortfolioOwnerId: ctx.activeUser.id,
              },
            ];

        return pipe(
          getLiveMarketData({
            specifiers,
            include: {
              priceData: !!requestedFields.data.subFields.priceData,
              unrealizedPnl: !!requestedFields.data.subFields.unrealizedPnl,
            },
          }),
          itMap(updates =>
            updates.holdings.map(({ type, holding, priceData, pnl }) => ({
              type,
              data: {
                ...holding,
                priceData,
                unrealizedPnl: !pnl ? undefined : { ...pnl, currencyAdjusted: {} as any },
              },
            }))
          ),
          source =>
            itLazyDefer(() => {
              const allHoldingsData: {
                [ownerIdAndSymbol: string]: Optional<
                  ObservedHoldingStats,
                  'priceData' | 'unrealizedPnl'
                >;
              } = Object.create(null);

              return pipe(
                source,
                itMap(holdingUpdates => {
                  const updatesRelevantToRequestor = holdingUpdates.filter(update => {
                    const ownerIdAndSymbol = `${update.data.ownerId}_${update.data.symbol}`;
                    return (
                      update.type === 'REMOVE' ||
                      requestedObservableFields.some(reqField => {
                        const [fieldPreUpdate, fieldPostUpdate] = [
                          allHoldingsData[ownerIdAndSymbol]?.[reqField],
                          update.data[reqField],
                        ];
                        return !isEqual(fieldPreUpdate, fieldPostUpdate);
                      })
                    );
                  });

                  for (const { type, data } of updatesRelevantToRequestor) {
                    const key = `${data.ownerId}_${data.symbol}`;
                    if (type === 'SET') {
                      allHoldingsData[key] = data;
                    } else {
                      delete allHoldingsData[key];
                    }
                  }

                  return updatesRelevantToRequestor;
                })
              );
            }),
          myIterableCleanupPatcher(async function* (source) {
            const iterator = source[Symbol.asyncIterator]();
            const initial = await iterator.next();
            if (!initial.done) {
              yield initial.value;
            }
            yield* pipe(
              { [Symbol.asyncIterator]: () => iterator },
              itFilter(relevantHoldingUpdates => !!relevantHoldingUpdates.length)
            );
          }),
          itMap(relevantHoldingUpdates => ({
            holdingStats: relevantHoldingUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
