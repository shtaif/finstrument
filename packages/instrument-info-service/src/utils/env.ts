import { parseEnv, z, port } from 'znv';

export { env };

const env = parseEnv(process.env, {
  NODE_ENV: z.enum(['test', 'development', 'production']).default('development'),
  PORT: port().default(3000),
  POSTGRES_DB_CONNECTION_URL: z.string().url().min(1),
  DB_LOGGING: z.coerce.boolean().default(false),
  ENABLE_NGROK_TUNNEL: z.coerce.boolean().default(false),
  NGROK_TUNNEL_AUTH_TOKEN: z.string().optional(),
});
