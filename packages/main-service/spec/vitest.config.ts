import { loadEnvFile } from 'node:process';
import { type UserConfig } from 'vitest/config';

loadEnvFile(`${import.meta.dirname}/../.env.tests.local`);

export default {
  test: {
    include: [`${import.meta.dirname}/**/*.spec.{js,cjs,mjs,ts}`],
    globalSetup: [`${import.meta.dirname}/globalSetup.ts`],
    setupFiles: [`${import.meta.dirname}/setup.ts`],
    isolate: false,
    fileParallelism: false,
    reporters: ['verbose'],
    pool: 'threads',
    poolOptions: {
      threads: { singleThread: undefined },
      forks: { singleFork: undefined },
      vmThreads: { singleThread: undefined },
      vmForks: { singleFork: undefined },
    },
    env: {
      NODE_ENV: 'test',
      PORT: '4001',
      APP_PUBLIC_URL: 'http://localhost:4001',
      ENABLE_NGROK_TUNNEL: 'false',
      INSTRUMENT_INFO_SERVICE_URL: 'http://mock-instrument-info-service',
      AUTH_FRONTEND_ORIGIN_URL: 'http://auth-frontend-origin-mock',
      AUTH_SESSION_COOKIE_DOMAIN: 'auth-session-cookie-domain-mock',
      SUPERTOKENS_CORE_URL: 'http://supertokens-core-mock',
      LIVE_MARKET_PRICES_SERVICE_URL: 'http://localhost:4002',
      LIVE_MARKET_PRICES_SERVICE_WS_URL: 'ws://localhost:4002',
      SYNC_SEQUELIZE_MODELS: 'false',
    },
  },
} as const satisfies UserConfig;
