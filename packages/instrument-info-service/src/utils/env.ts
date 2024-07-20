import { parseEnv, z, port } from 'znv';

export { env };

const env = parseEnv(process.env, {
  DB_LOGGING: z.boolean().default(false),
  POSTGRES_DB_CONNECTION_URL: z.string().url().min(1),
  PORT: port().default(3000),
  NODE_ENV: z.enum(['test', 'development', 'production']).default('development'),
  ENABLE_NGROK_TUNNEL: z.boolean().default(false),
  NGROK_TUNNEL_AUTH_TOKEN: z.string().optional(),
});
