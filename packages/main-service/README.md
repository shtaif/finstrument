## Setup for quick start:

### For running the service:

Create a `.env.local` file and edit its env vars according to this sample:

```sh
NODE_ENV=development
PORT=3001
APP_PUBLIC_URL=http://localhost:3001
AUTH_FRONTEND_ORIGIN_URL=http://localhost:5173
AUTH_SESSION_COOKIE_DOMAIN=.localhost
LIVE_MARKET_PRICES_SERVICE_URL=http://localhost:3002
LIVE_MARKET_PRICES_SERVICE_WS_URL=ws://localhost:3002
INSTRUMENT_INFO_SERVICE_URL=http://localhost:3004
SUPERTOKENS_CORE_URL=http://localhost:3567
REDIS_CONNECTION_URL=redis://127.0.0.1:6379
POSTGRES_DB_CONNECTION_URL="postgresql://finance_data_project_user:123456789@127.0.0.1:5432/finance_data_project?schema=public"
ENABLE_NGROK_TUNNEL=false
NGROK_TUNNEL_AUTH_TOKEN=
SYNC_SEQUELIZE_MODELS=false
DB_LOGGING=false
```

### For running tests:

Create a `.env.tests.local` file and edit its env vars according to this sample:

```sh
REDIS_CONNECTION_URL=redis://127.0.0.1:6379
POSTGRES_DB_CONNECTION_URL="postgresql://finance_data_project_user:123456789@127.0.0.1:5432/finance_data_project?schema=main_service_testing"
DB_LOGGING=false
```
