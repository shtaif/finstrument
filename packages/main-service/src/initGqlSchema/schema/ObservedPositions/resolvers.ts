import { intersection, isEqual } from 'lodash';
import { type Optional } from 'utility-types';
import { pipe, typedObjectKeys } from 'shared-utils';
import { itFilter, itLazyDefer, itMap, myIterableCleanupPatcher } from 'iterable-operators';
import type {
  Resolvers,
  Subscription,
  ObservedPosition,
} from '../../../generated/graphql-schema.d.ts';
import { getLiveMarketData } from '../../../utils/getLiveMarketData/index.js';
import { gqlFormattedFieldSelectionTree } from '../../../utils/gqlFormattedFieldSelectionTree/index.js';

export { resolvers };

const resolvers = {
  Subscription: {
    positions: {
      subscribe(_, args, _ctx, info) {
        const observableFields = [
          'remainingQuantity',
          'realizedProfitOrLoss',
          'recordUpdatedAt',
          'priceData',
          'unrealizedPnl',
        ] as const satisfies (keyof ObservedPosition)[];

        const requestedFields = gqlFormattedFieldSelectionTree<Subscription['positions']>(info);

        const requestedObservableFields = intersection(
          observableFields,
          typedObjectKeys(requestedFields.data.subFields)
        ) as typeof observableFields;

        const specifiers = args.filters.ids.map(id => ({
          type: 'POSITION' as const,
          positionId: id,
        }));

        return pipe(
          getLiveMarketData({
            specifiers,
            include: {
              priceData: !!requestedFields.data.subFields.priceData,
              unrealizedPnl: !!requestedFields.data.subFields.unrealizedPnl,
            },
          }),
          itMap(updates =>
            updates.positions.map(({ type, position, priceData, pnl }) => ({
              type,
              data: {
                ...position,
                priceData,
                unrealizedPnl: !pnl ? undefined : { ...pnl, currencyAdjusted: {} as any },
              },
            }))
          ),
          source =>
            itLazyDefer(() => {
              const allPositionsData: {
                [posId: string]: Optional<ObservedPosition, 'priceData' | 'unrealizedPnl'>;
              } = Object.create(null);

              return pipe(
                source,
                itMap(positionUpdates => {
                  const updatesRelevantToRequestor = positionUpdates.filter(update => {
                    return (
                      update.type == 'REMOVE' ||
                      requestedObservableFields.some(reqField => {
                        const fieldPreUpdate = allPositionsData[update.data.id]?.[reqField];
                        const fieldPostUpdate = update.data[reqField];
                        return !isEqual(fieldPreUpdate, fieldPostUpdate);
                      })
                    );
                  });

                  Object.assign(allPositionsData, positionUpdates);

                  for (const { type, data } of updatesRelevantToRequestor) {
                    if (type === 'SET') {
                      allPositionsData[data.id] = data;
                    } else {
                      delete allPositionsData[data.id];
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
              itFilter(relevantChangedPositions => !!relevantChangedPositions.length)
            );
          }),
          itMap(relevantPositionUpdates => ({
            positions: relevantPositionUpdates,
          }))
        );
      },
    },
  },
} satisfies Resolvers;
