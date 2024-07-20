import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll } from 'vitest';
import { startApp } from '../src/app.js';
import { testRedisPublisher } from './utils/testRedisPublisher.js';
import { testRedisSubscriber } from './utils/testRedisSubscriber.js';
// import { mockMarketDataService } from './utils/mockMarketDataService.js';

// const mockMarketDataServiceListeningPromise = once(mockMarketDataService, 'listening');

beforeAll(async () => {
  appTeardown = await startApp();
  await Promise.all([testRedisPublisher.connect(), testRedisSubscriber.connect()]);
  // await once(mockMarketDataService, 'listening');
  // console.log('!!!');
  // console.log('START');
  // await mockMarketDataServiceListeningPromise;
  // console.log('END');
});

afterAll(async () => {
  await setTimeout(0); // TODO: Explain what happens at the end of tested GQL subscriptions without this patch delay...
  await appTeardown?.();
  await Promise.all([testRedisPublisher.disconnect(), testRedisSubscriber.disconnect()]);
  // await new Promise<void>((resolve, reject) =>
  //   mockMarketDataService.close(err => (err ? reject(err) : resolve()))
  // );
});

let appTeardown: undefined | (() => Promise<void>);
