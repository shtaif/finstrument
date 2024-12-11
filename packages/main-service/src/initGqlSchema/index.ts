import { readFile } from 'node:fs/promises';
import { GraphQLSchema, GraphQLError } from 'graphql/index.js';
import { asyncPipe, CustomError } from 'shared-utils';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mapSchema, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver } from 'graphql';
import { appGqlContext } from './appGqlContext.js';
import { resolvers as portfolioStatsResolvers } from './schema/PortfolioStats/resolvers.js';
import { resolvers as portfolioStatsChangesResolvers } from './schema/PortfolioStatsChange/resolvers.js';
import { resolvers as holdingStatsResolvers } from './schema/HoldingStats/resolvers.js';
import { resolvers as holdingStatsChangesResolvers } from './schema/HoldingStatsChanges/resolvers.js';
import { resolvers as lotResolvers } from './schema/Lot/resolvers.js';
import { resolvers as instrumentInfoResolvers } from './schema/InstrumentInfo/resolvers.js';
import { resolvers as aggregatePnlResolvers } from './schema/AggregatePnl/resolvers.js';
import { resolvers as observedCombinedPortfolioStatsResolvers } from './schema/ObservedCombinedPortfolioStats/resolvers.js';
import { resolvers as observedPortfolioStatsResolvers } from './schema/ObservedPortfolioStats/resolvers.js';
import { resolvers as observedPositionResolvers } from './schema/ObservedPositions/resolvers.js';
import { resolvers as observedLotsResolvers } from './schema/ObservedLots/resolvers.js';
import { resolvers as setTradesResultResolvers } from './schema/SetTradesResult/resolvers.js';
import { resolvers as userResolvers } from './schema/User/resolvers.js';
import { resolvers as meInfoResolvers } from './schema/MeInfo/resolvers.js';
import { resolvers as countryLocaleResolvers } from './schema/CountryLocale/resolvers.js';

export { mappedGqlSchema as gqlSchema, mappedGqlSchema as initedGqlSchema, appGqlContext };

const typeDefs = await Promise.all(
  [
    `${import.meta.dirname}/schema/common.graphql`,
    `${import.meta.dirname}/schema/User/schema.graphql`,
    `${import.meta.dirname}/schema/MeInfo/schema.graphql`,
    `${import.meta.dirname}/schema/CountryLocale/schema.graphql`,
    `${import.meta.dirname}/schema/PortfolioStats/schema.graphql`,
    `${import.meta.dirname}/schema/PortfolioStatsChange/schema.graphql`,
    `${import.meta.dirname}/schema/HoldingStats/schema.graphql`,
    `${import.meta.dirname}/schema/HoldingStatsChanges/schema.graphql`,
    `${import.meta.dirname}/schema/Lot/schema.graphql`,
    `${import.meta.dirname}/schema/SymbolPortfolioPortion/schema.graphql`,
    `${import.meta.dirname}/schema/InstrumentInfo/schema.graphql`,
    `${import.meta.dirname}/schema/AggregatePnl/schema.graphql`,
    `${import.meta.dirname}/schema/ObservedCombinedPortfolioStats/schema.graphql`,
    `${import.meta.dirname}/schema/ObservedPortfolioStats/schema.graphql`,
    `${import.meta.dirname}/schema/ObservedPositions/schema.graphql`,
    `${import.meta.dirname}/schema/ObservedLots/schema.graphql`,
    `${import.meta.dirname}/schema/SetTradesResult/schema.graphql`,
  ].map(defsFilepath => readFile(defsFilepath, 'utf-8'))
);

const resolvers = [
  userResolvers,
  meInfoResolvers,
  countryLocaleResolvers,
  portfolioStatsResolvers,
  portfolioStatsChangesResolvers,
  holdingStatsResolvers,
  holdingStatsChangesResolvers,
  lotResolvers,
  instrumentInfoResolvers,
  aggregatePnlResolvers,
  observedCombinedPortfolioStatsResolvers,
  observedPortfolioStatsResolvers,
  observedPositionResolvers,
  observedLotsResolvers,
  setTradesResultResolvers,
];

const mappedGqlSchema: GraphQLSchema = await asyncPipe(
  await makeExecutableSchema({
    typeDefs,
    resolvers,
  }),
  gqlSchema =>
    mapSchema(gqlSchema, {
      [MapperKind.OBJECT_FIELD]: fieldConfig => {
        const origResolve = fieldConfig.resolve ?? defaultFieldResolver;
        return {
          ...fieldConfig,
          async resolve(parent, args, ctx, info) {
            try {
              return await origResolve(parent, args, ctx, info);
            } catch (err) {
              if (err instanceof GraphQLError) {
                throw err;
              }
              if (err instanceof CustomError) {
                const { message, ...restEnumerablePropsOfErr } = err;
                throw new GraphQLError(message, {
                  extensions: restEnumerablePropsOfErr,
                });
              }
              console.error('Error during GraphQL field resolution:', err);
              throw new Error('An internal server error occurred');
            }
          },
        };
      },
    })
);
