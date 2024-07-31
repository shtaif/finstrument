import { once } from 'node:events';
import { env } from './utils/env.js';
import { startApp } from './app.js';

const teardownApp = await startApp();

if (env.NODE_ENV === 'production') {
  await Promise.race(['SIGTERM', 'SIGINT'].map(signal => once(process, signal)));
  await teardownApp();
}
