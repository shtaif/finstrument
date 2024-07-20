import { z } from 'zod';
import { uniq } from 'lodash';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { createClient, type RedisClientType } from 'redis';
import redisSubscribeToPattern from '../redisSubscribeToPattern/index.js';
import * as redisPubSubEventKeys from './redisPubSubEventKeys/index.js';

export { userHoldingsChangedTopic, type UserHoldingsChangedTopicPayload };

const userHoldingsChangedTopic = {
  publish: async (
    redisPublisherClient: RedisClientType,
    payload: UserHoldingsChangedTopicPayload
  ): Promise<void> => {
    const eventKey = redisPubSubEventKeys.userHoldingsChanged(payload.ownerId);
    const eventPayload = JSON.stringify(payload);
    await redisPublisherClient.publish(eventKey, eventPayload);
  },

  subscribe(
    redisSubscriberClient: ReturnType<typeof createClient>,
    params: {
      targetOwnerIds: string[];
    }
  ): AsyncIterable<UserHoldingsChangedTopicPayload> {
    return pipe(
      redisSubscribeToPattern({
        redisSubscriberClient,
        pattern: pipe(
          params.targetOwnerIds,
          v => uniq(v),
          v => v.map(redisPubSubEventKeys.userHoldingsChanged)
        ),
      }),
      itMap(({ message }) => pipe(message, JSON.parse, userHoldingsChangedTopicPayloadSchema.parse))
    );
  },
};

const userHoldingsChangedTopicPayloadSchema = z.object({
  ownerId: z.string().min(1),
  portfolioStats: z.object({
    set: z.array(z.object({ forCurrency: z.string().min(1).nullable() })),
    remove: z.array(z.object({ forCurrency: z.string().min(1).nullable() })),
  }),
  holdingStats: z.object({
    set: z.array(z.string().min(1)),
    remove: z.array(z.string().min(1)),
  }),
  positions: z.object({
    set: z.array(z.string().min(1)),
    remove: z.array(z.string().min(1)),
  }),
});

type UserHoldingsChangedTopicPayload = z.infer<typeof userHoldingsChangedTopicPayloadSchema>;
