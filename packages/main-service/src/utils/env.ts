import { parseEnv, z, port } from 'znv';

export { parsedEnvPatchedWithExplicitTyping as env };

const envShapeDef = {
  INSTRUMENT_INFO_SERVICE_URL: z.string().url().min(1),
  LIVE_MARKET_PRICES_SERVICE_URL: z.string().url().min(1),
  LIVE_MARKET_PRICES_SERVICE_WS_URL: z.string().url().min(1),
  DB_LOGGING: z.boolean().default(false),
  REDIS_CONNECTION_URL: z.string().url().min(1),
  POSTGRES_DB_CONNECTION_URL: z.string().url().min(1),
  PORT: port().default(3000),
  NODE_ENV: z.enum(['test', 'development', 'production']).default('development'),
  ENABLE_NGROK_TUNNEL: z.boolean().default(false),
  NGROK_TUNNEL_AUTH_TOKEN: z.string().optional(),
};

/**
 * `znv` module doesn't publicly export `parseEnv` function`s return typings, therefore TS would error
 * if we'd just exported its result as-is. This is a workaround recreating the correct specific env shape
 * type explicitly
 * Issue yet to be resolved from `znv`'s side at time to writing, discussed at: https://github.com/lostfictions/znv/issues/12.
 */
const parsedEnvPatchedWithExplicitTyping = parseEnv(process.env, envShapeDef) as {
  [K in keyof typeof envShapeDef]: z.infer<(typeof envShapeDef)[K]>;
};
