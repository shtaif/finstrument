import { intersection, isEqual } from 'lodash';
import { type Optional } from 'utility-types';
import { pipe, typedObjectKeys } from 'shared-utils';
import { itFilter, itLazyDefer, itMap, myIterableCleanupPatcher } from 'iterable-operators';
import type {
  Resolvers,
  Subscription,
  ObservedPortfolioStats,
} from '../../../generated/graphql-schema.d.ts';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { type PortfolioObjectSpecifier } from '../../../utils/observeStatsObjectChanges/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';

export { resolvers };

const resolvers = {
  Subscription: {
    portfolioStats: {
      subscribe(_, _args, ctx, info) {
        const observableFields = [
          'relatedTradeId',
          'lastChangedAt',
          'totalPresentInvestedAmount',
          'totalRealizedAmount',
          'totalRealizedProfitOrLossAmount',
          'totalRealizedProfitOrLossRate',
          'unrealizedPnl',
        ] as const satisfies (keyof ObservedPortfolioStats)[];

        const requestedFields =
          gqlFormattedFieldSelectionTree<Subscription['portfolioStats']>(info);

        const requestedObservableFields = intersection(
          observableFields,
          typedObjectKeys(requestedFields.data.subFields)
        ) as typeof observableFields;

        const specifiers = [
          {
            type: 'PORTFOLIO' as const,
            portfolioOwnerId: ctx.activeUser.id,
            statsCurrency: undefined,
          },
        ] satisfies PortfolioObjectSpecifier[];

        return pipe(
          getLiveMarketData({
            specifiers,
            include: { unrealizedPnl: !!requestedFields.data.subFields.unrealizedPnl },
          }),
          itMap(updates =>
            updates.portfolios.map(({ type, portfolio, pnl }) => ({
              type,
              data: {
                ...portfolio,
                unrealizedPnl: { ...pnl, currencyAdjusted: {} as any },
              },
            }))
          ),
          source =>
            itLazyDefer(() => {
              const allPStatsData: {
                [ownerIdAndCurrency: string]: Optional<ObservedPortfolioStats, 'unrealizedPnl'>;
              } = Object.create(null);

              return pipe(
                source,
                itMap(pStatsUpdates => {
                  const updatesRelevantToRequestor = pStatsUpdates.filter(update => {
                    const ownerIdAndCurrency = `${update.data.ownerId}_${update.data.forCurrency ?? ''}`;
                    return (
                      update.type === 'REMOVE' ||
                      // !allPStatsData[ownerIdAndCurrency] ||
                      requestedObservableFields.some(reqField => {
                        const [fieldPreUpdate, fieldPostUpdate] = [
                          allPStatsData[ownerIdAndCurrency]?.[reqField],
                          update.data[reqField],
                        ];
                        return !isEqual(fieldPreUpdate, fieldPostUpdate);
                      })
                    );
                  });

                  for (const { type, data } of updatesRelevantToRequestor) {
                    const key = `${data.ownerId}_${data.forCurrency ?? ''}`;
                    if (type === 'SET') {
                      allPStatsData[key] = data;
                    } else {
                      delete allPStatsData[key];
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
              itFilter(relevantChangedPStats => !!relevantChangedPStats.length)
            );
          }),
          itMap(relevantPStatsUpdates => ({
            portfolioStats: relevantPStatsUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
