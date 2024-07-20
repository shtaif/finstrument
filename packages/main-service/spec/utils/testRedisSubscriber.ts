import { createClient as createRedisClient, type RedisClientType } from 'redis';

export { testRedisSubscriber };

const testRedisSubscriber: RedisClientType = createRedisClient({
  url: process.env.REDIS_CONNECTION_URL,
});
