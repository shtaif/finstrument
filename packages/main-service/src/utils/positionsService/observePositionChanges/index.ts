import { execPipe as pipe } from 'iter-tools';
import { myIterableCleanupPatcher } from 'iterable-operators';
import redisSubscribeToPattern from '../../redisSubscribeToPattern/index.js';
import * as redisPubSubEventKeys from '../../pubsubTopics/redisPubSubEventKeys/index.js';
import { retrievePositions, type Position } from '../retrievePositions/index.js';

export { observePositionChanges, type Position };

function observePositionChanges(params: { ownerId: string }): AsyncIterable<Position[]> {
  const { ownerId } = params;

  return pipe(
    redisSubscribeToPattern({
      pattern: redisPubSubEventKeys.userHoldingsChanged(ownerId),
    }),
    myIterableCleanupPatcher(async function* (source) {
      const userPositionChangeEvents = source[Symbol.asyncIterator]();
      try {
        const firstChangePromise = userPositionChangeEvents.next();

        yield await retrievePositionsByForOwnerIds(ownerId);

        await firstChangePromise;

        yield await retrievePositionsByForOwnerIds(ownerId);

        for await (const _ of { [Symbol.asyncIterator]: () => userPositionChangeEvents }) {
          yield await retrievePositionsByForOwnerIds(ownerId);
        }
      } finally {
        await userPositionChangeEvents.return!(undefined);
      }
    })
  );
}

async function retrievePositionsByForOwnerIds(ownerId: string): Promise<Position[]> {
  return await retrievePositions({
    filters: { ownerIds: [ownerId] },
  });
}
