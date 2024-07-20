import { WebSocket } from 'ws';
import { createClient as createGqlWsClient } from 'graphql-ws';

export { gqlWsClient };

const gqlWsClient = createGqlWsClient({
  webSocketImpl: WebSocket,
  url: `ws://localhost:${process.env.PORT}/graphql`,
});
