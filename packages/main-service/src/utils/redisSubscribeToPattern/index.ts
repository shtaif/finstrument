import { iterified, IterifiedIterable } from 'iterified';
import { createClient } from 'redis';
import { subscriberRedisClient as redisSubscriber } from '../redisClients.js';

export default redisSubscribeToPattern;

function redisSubscribeToPattern({
  pattern,
  redisSubscriberClient = redisSubscriber,
}: {
  redisSubscriberClient?: ReturnType<typeof createClient>;
  pattern: string | string[];
}): IterifiedIterable<{
  channel: string;
  message: string;
}> {
  return iterified(async next => {
    const listener = (message: string, channel: string): void => {
      next({ message, channel });
    };
    await redisSubscriberClient.pSubscribe(pattern, listener);
    return async () => {
      await redisSubscriberClient.pUnsubscribe(pattern, listener);
    };
  });
}
