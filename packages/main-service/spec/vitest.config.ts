import { type UserConfig } from 'vitest/config';

export default {
  test: {
    include: ['./spec/**/*.spec.{js,cjs,mjs,ts}'],
    globalSetup: ['./spec/globalSetup.ts'],
    setupFiles: ['./spec/setup.ts'],
    isolate: false,
    fileParallelism: false,
    reporters: ['verbose'],
    poolOptions: {
      threads: { singleThread: undefined },
      forks: { singleFork: undefined },
      vmThreads: { singleThread: undefined },
      vmForks: { singleFork: undefined },
    },
    env: {
      NODE_ENV: 'test',
      ENABLE_NGROK_TUNNEL: 'false',
      PORT: '4001',
      REDIS_CONNECTION_URL: 'redis://127.0.0.1:6379',
      POSTGRES_DB_CONNECTION_URL: `postgres://postgres_user:123456789@127.0.0.1:5433/finance_project_testing_db`,
      INSTRUMENT_INFO_SERVICE_URL: 'http://mock-instrument-info-service',
      LIVE_MARKET_PRICES_SERVICE_URL: 'http://mock-live-market-prices-service',
      LIVE_MARKET_PRICES_SERVICE_WS_URL: 'ws://localhost:4002',
    },
  },
} as const satisfies UserConfig;
