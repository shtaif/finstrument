import { createClient as createRedisClient, type RedisClientType } from 'redis';

export { testRedisPublisher };

const testRedisPublisher: RedisClientType = createRedisClient({
  url: process.env.REDIS_CONNECTION_URL,
});
