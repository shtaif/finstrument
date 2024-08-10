import { pipe } from 'shared-utils';
import { ApolloClient, InMemoryCache, split, HttpLink } from '@apollo/client';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient as createGqlWsClient } from 'graphql-ws';

export { gqlClient, gqlWsClient };

const httpLink = new HttpLink({
  uri: `${import.meta.env.VITE_API_URL}/graphql`,
});

const gqlWsClient = createGqlWsClient({
  url: pipe(
    import.meta.env.VITE_API_URL,
    $ => new URL($),
    $ => `${$.protocol === 'https:' ? 'wss' : 'ws'}://${$.host}/graphql`
  ),
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
  credentials: 'include',
});
