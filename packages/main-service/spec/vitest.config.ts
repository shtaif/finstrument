import { type UserConfig } from 'vitest/config';

export default {
  test: {
    include: ['./spec/**/*.spec.{js,cjs,mjs,ts}'],
    globalSetup: ['./spec/globalSetup.ts'],
    setupFiles: ['./spec/setup.ts'],
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
      REDIS_CONNECTION_URL: 'redis://127.0.0.1:6379',
      POSTGRES_DB_CONNECTION_URL:
        'postgresql://finance_data_project_user:123456789@127.0.0.1:5432/finance_data_project?schema=main_service_testing',
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
