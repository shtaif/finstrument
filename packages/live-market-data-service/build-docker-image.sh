#!/bin/bash

docker buildx build \
  -t finstrument/live-market-data-service \
  -f "$(dirname "$0")"/dockerfile \
  "$(dirname "$0")"/../../.


# docker run \
#   -it \
#   --init \
#   -p 3002:3002 \
#   -e NODE_ENV="development" \
#   -e PORT="3002" \
#   -e MOCK_SYMBOLS_MARKET_DATA="false" \
#   -e SYMBOL_MARKET_DATA_POLLING_INTERVAL_MS="1000" \
#   -e ENABLE_NGROK_TUNNEL="false" \
#   -e NGROK_TUNNEL_AUTH_TOKEN="2Q3iVlAlTbyIqNIH9uXFekgnFg8_5hW5Ub9arpd4oMhwQHbLE" \
#   --name finstrument-live-market-data-service \
#   finstrument/live-market-data-service
