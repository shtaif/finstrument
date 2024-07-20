import { env } from './env.js';
import { createClient, type RedisClientType } from 'redis';

const mainRedisClient: RedisClientType = createClient({
  url: env.REDIS_CONNECTION_URL,
});

const subscriberRedisClient: RedisClientType = mainRedisClient.duplicate();

export { mainRedisClient, subscriberRedisClient };
