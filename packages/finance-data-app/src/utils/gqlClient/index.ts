import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient as createGqlWsClient } from 'graphql-ws';

export { gqlClient, gqlWsClient };

const gqlWsClient = createGqlWsClient({
  url: `ws://${import.meta.env.VITE_API_HOST || 'localhost:3001'}/graphql`,
});

const httpLink = new HttpLink({
  uri: `http://${import.meta.env.VITE_API_HOST || 'localhost:3001'}/graphql`,
});

const wsLink = new GraphQLWsLink(gqlWsClient);

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  httpLink
);

const gqlClient = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache(),
});
