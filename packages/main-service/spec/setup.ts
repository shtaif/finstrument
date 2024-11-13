import { afterAll, beforeAll } from 'vitest';
import { startApp } from '../src/app.js';
import { testRedisPublisher } from './utils/testRedisPublisher.js';
import { testRedisSubscriber } from './utils/testRedisSubscriber.js';
import { startMockMarketDataService } from './utils/mockMarketDataService.js';

const globalObj = global as any;

globalObj.isAppStarted ??= false;

beforeAll(async () => {
  if (!globalObj.isAppStarted) {
    globalObj.isAppStarted = true;
    const [_appTeardown, _mockMarketDataService] = await Promise.all([
      startApp(),
      startMockMarketDataService(),
      testRedisPublisher.connect(),
      testRedisSubscriber.connect(),
    ]);
  }
});

afterAll(async () => {});
