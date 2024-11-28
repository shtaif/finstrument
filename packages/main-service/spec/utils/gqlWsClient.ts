import { WebSocket } from 'ws';
import {
  createClient as createGqlWsClient,
  type SubscribePayload,
  type ExecutionResult,
} from 'graphql-ws';

export { gqlWsClient, gqlWsClientIterateDisposable };

const gqlWsClient = createGqlWsClient({
  webSocketImpl: WebSocket,
  url: `ws://localhost:${process.env.PORT}/graphql`,
});

function gqlWsClientIterateDisposable<Data = Record<string, unknown>, Extensions = unknown>(
  subscribePayload: SubscribePayload
): AsyncIterableIterator<ExecutionResult<Data, Extensions>> & AsyncDisposable {
  const subscription = gqlWsClient.iterate<Data, Extensions>(subscribePayload);
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
