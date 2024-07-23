import { compact, intersection, isEqual } from 'lodash';
import { type Optional } from 'utility-types';
import { pipe, typedObjectKeys } from 'shared-utils';
import { itFilter, itLazyDefer, itMap } from 'iterable-operators';
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
          typedObjectKeys(requestedFields.data?.subFields ?? {})
        ) as typeof observableFields;

        const specifiers = [
          {
            type: 'PORTFOLIO' as const,
            portfolioOwnerId: ctx.activeUser.id,
            statsCurrency: undefined,
          },
        ] satisfies PortfolioObjectSpecifier[];

        const translateCurrency =
          requestedFields.data?.subFields.unrealizedPnl?.subFields.currencyAdjusted?.args.currency;

        return pipe(
          getLiveMarketData({
            specifiers,
            translateToCurrencies: compact([translateCurrency]),
            include: { unrealizedPnl: !!requestedFields.data?.subFields.unrealizedPnl },
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
                      currencyAdjusted: pnl.byTranslateCurrencies[0],
                    },
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
          itFilter((relevantChangedPStats, i) => i === 0 || !!relevantChangedPStats.length),
          itMap(relevantPStatsUpdates => ({
            portfolioStats: relevantPStatsUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
