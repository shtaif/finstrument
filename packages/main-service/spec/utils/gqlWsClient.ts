import { WebSocket } from 'ws';
import { createClient as createGqlWsClient, type SubscribePayload } from 'graphql-ws';

export { gqlWsClient, gqlWsClientIterateDisposable };

const gqlWsClient = createGqlWsClient({
  webSocketImpl: WebSocket,
  url: `ws://localhost:${process.env.PORT}/graphql`,
});

function gqlWsClientIterateDisposable(
  subscribePayload: SubscribePayload
): ReturnType<typeof gqlWsClient.iterate> & AsyncDisposable {
  const subscription = gqlWsClient.iterate(subscribePayload);
  return {
    next: () => subscription.next(),
    return: () => subscription.return!(),
    [Symbol.asyncIterator]() {
      return this;
    },
    async [Symbol.asyncDispose]() {
      await subscription.return!();
    },
  };
}
