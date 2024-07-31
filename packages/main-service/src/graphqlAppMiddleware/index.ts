import express from 'express';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { initedGqlSchema } from '../initGqlSchema/index.js';
import { appGqlContext } from '../initGqlSchema/appGqlContext.js';

export { createGraphqlAppMiddleware };

async function createGraphqlAppMiddleware(): Promise<{
  graphqlAppMiddleware: express.RequestHandler;
}> {
  const apolloServer = new ApolloServer<{}>({
    schema: initedGqlSchema,
    plugins: [],
    introspection: true,
    status400ForVariableCoercionErrors: true,
    nodeEnv: 'development', // This is given to enable the GraphQL Explorer for us ALSO in production for the meantime
  });

  await apolloServer.start();

  return {
    graphqlAppMiddleware: expressMiddleware(apolloServer, {
      context: expressCtxFunctionArg => appGqlContext(expressCtxFunctionArg),
    }),
  };
}
