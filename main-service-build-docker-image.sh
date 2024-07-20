#!/bin/bash

docker buildx build \
  -t finstrument/main-service \
  -f "$(dirname "$0")"/main-service.dockerfile \
  "$(dirname "$0")"/.

# docker run \
#   -it \
#   --init \
#   -e NODE_ENV="production" \
#   -p 3001:3001 \
#   -e PORT="3001" \
#   -e LIVE_MARKET_PRICES_SERVICE_URL="http://host.docker.internal:3002" \
#   -e LIVE_MARKET_PRICES_SERVICE_WS_URL="ws://host.docker.internal:3003" \
#   -e INSTRUMENT_INFO_SERVICE_URL="http://host.docker.internal:3004" \
#   -e REDIS_CONNECTION_URL="redis://host.docker.internal:6379" \
#   -e POSTGRES_DB_CONNECTION_URL="postgres://finance_data_project_user:123456789@host.docker.internal:5432/finance_data_project" \
#   -e ENABLE_NGROK_TUNNEL="false" \
#   -e NGROK_TUNNEL_AUTH_TOKEN="2Q3iVlAlTbyIqNIH9uXFekgnFg8_5hW5Ub9arpd4oMhwQHbLE" \
#   -e DB_LOGGING="false" \
#   --name finstrument-main-service \
#   finstrument/main-service
