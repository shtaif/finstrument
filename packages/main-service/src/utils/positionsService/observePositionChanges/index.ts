import { execPipe as pipe } from 'iter-tools';
import { myIterableCleanupPatcher } from 'iterable-operators';
import redisSubscribeToPattern from '../../redisSubscribeToPattern/index.js';
import * as redisPubSubEventKeys from '../../pubsubTopics/redisPubSubEventKeys/index.js';
import { retrieveLots, type Lot } from '../retrieveLots/index.js';

export { observePositionChanges, type Lot };

function observePositionChanges(params: { ownerId: string }): AsyncIterable<Lot[]> {
  const { ownerId } = params;

  return pipe(
    redisSubscribeToPattern({
      pattern: redisPubSubEventKeys.userHoldingsChanged(ownerId),
    }),
    myIterableCleanupPatcher(async function* (source) {
      const userPositionChangeEvents = source[Symbol.asyncIterator]();
      try {
        const firstChangePromise = userPositionChangeEvents.next();

        yield await retrieveLotsByForOwnerIds(ownerId);

        await firstChangePromise;

        yield await retrieveLotsByForOwnerIds(ownerId);

        for await (const _ of { [Symbol.asyncIterator]: () => userPositionChangeEvents }) {
          yield await retrieveLotsByForOwnerIds(ownerId);
        }
      } finally {
        await userPositionChangeEvents.return!(undefined);
      }
    })
  );
}

async function retrieveLotsByForOwnerIds(ownerId: string): Promise<Lot[]> {
  return await retrieveLots({
    filters: { ownerIds: [ownerId] },
  });
}
