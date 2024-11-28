import { readFile } from 'node:fs/promises';
import { GraphQLSchema, GraphQLError } from 'graphql/index.js';
import { entries } from 'lodash-es';
import { pipe, asyncPipe, CustomError } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { z } from 'zod';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { mapSchema, MapperKind } from '@graphql-tools/utils';
import { defaultFieldResolver } from 'graphql';
import type { Resolvers } from '../generated/graphql-schema.d.ts';
import observePricesData from '../utils/observePricesData/index.js';
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
import { resolvers as observedHoldingStatsResolvers } from './schema/ObservedHoldingStats/resolvers.js';
import { resolvers as observedLotsResolvers } from './schema/ObservedLots/resolvers.js';
import { resolvers as setTradesResultResolvers } from './schema/SetTradesResult/resolvers.js';
import { resolvers as userResolvers } from './schema/User/resolvers.js';
import { resolvers as meInfoResolvers } from './schema/MeInfo/resolvers.js';

export { mappedGqlSchema as gqlSchema, mappedGqlSchema as initedGqlSchema, appGqlContext };

const typeDefs = await Promise.all(
  [
    `${import.meta.dirname}/schema/common.graphql`,
    `${import.meta.dirname}/schema/User/schema.graphql`,
    `${import.meta.dirname}/schema/MeInfo/schema.graphql`,
    `${import.meta.dirname}/schema/legacySchemaToSafelyClear.graphql`,
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
    `${import.meta.dirname}/schema/ObservedHoldingStats/schema.graphql`,
    `${import.meta.dirname}/schema/ObservedLots/schema.graphql`,
    `${import.meta.dirname}/schema/SetTradesResult/schema.graphql`,
  ].map(defsFilepath => readFile(defsFilepath, 'utf-8'))
);

const resolvers = [
  olderAndProbablyUnusedResolversNeedToSortOut(),
  userResolvers,
  meInfoResolvers,
  portfolioStatsResolvers,
  portfolioStatsChangesResolvers,
  holdingStatsResolvers,
  holdingStatsChangesResolvers,
  lotResolvers,
  instrumentInfoResolvers,
  aggregatePnlResolvers,
  observedCombinedPortfolioStatsResolvers,
  observedPortfolioStatsResolvers,
  observedHoldingStatsResolvers,
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

function olderAndProbablyUnusedResolversNeedToSortOut() {
  return {
    Query: {
      hello() {
        return 'world';
      },

      getSymbolPriceDataForTest() {
        return {
          symbol: 'my_symbol',
          // regularMarketPrice: 0.01,
          // regularMarketTime: new Date(),
          // a: 'aaa',
        } as const;
      },

      getSymbolHoldingForTest() {
        return {
          changes: [
            {
              symbol: 'my_symbol',
              holding: {
                symbol: 'my_symbol',
                breakEvenPrice: 0.01,
                totalQuantity: 10,
                unrealizedProfit: {
                  amount: 0.01,
                  percent: 0.01,
                },
                positions: [],
              },
              revenue: {
                percent: 0.01,
                amount: 10,
              },
              // priceData: {
              //   symbol: 'my_symbol',
              //   // regularMarketPrice: 0.01,
              //   // regularMarketTime: new Date(),
              // },
            },
          ],
        };
      },
    },

    Subscription: {
      observePricesData: {
        subscribe(_, args) {
          // if (!symbols.length) {
          //   throw new Error('The "input.symbols" argument must contain one or more symbol names');
          // }
          z.object({
            input: z.object({
              symbols: z.array(z.string()).min(1),
            }),
          }).parse(args);

          return pipe(
            observePricesData({ symbols: args.input.symbols }),
            itMap(priceDataItem => ({
              priceUpdates: entries(priceDataItem).map(([symbol, priceDataItem]) => ({
                symbol,
                ...priceDataItem,
              })),
            })),
            itMap(output => ({ observePricesData: output }))
          );
        },
      },

      // observeHoldingRevenue: {
      //   async subscribe(_, args) {
      //     const ownerId = (await UserModel.findOne({ where: { alias: args.input.userAlias } }))!.id;
      //     return pipe(
      //       itCombineLatest(
      //         liveRevenueData({ userAlias: args.input.userAlias }),
      //         positionsService.observeHoldingChanges([{ ownerId }])
      //       ),
      //       itMap(([revenueUpdates, changedHoldings]) => ({
      //         changes: pipe(
      //           fpEntries(revenueUpdates.updatesBySymbol),
      //           fpMap(([symbol, { profitOrLoss, price }]) => ({
      //             userAlias: args.input.userAlias,
      //             symbol,
      //             holding: {
      //               userAlias: args.input.userAlias,
      //               ...changedHoldings.find(({ symbol }) => symbol)!,
      //             },
      //             revenue: {
      //               percent: profitOrLoss.percent,
      //               amount: profitOrLoss.amount,
      //             },
      //             priceData: {
      //               symbol,
      //               regularMarketPrice: price.regularMarketPrice,
      //               regularMarketTime: price.regularMarketTime,
      //             },
      //           }))
      //         ),
      //       })),
      //       itMap(output => ({ observeHoldingRevenue: output }))
      //     );
      //   },
      // },
    },

    HoldingRevenueChange: {
      async holding(parentRevenueChange) {
        // const userAlias = parentRevenueChange.holding!.userAlias!;
        // const positions = await positionsService.retrieveLots({ filters: { userAlias } });
        return {
          symbol: parentRevenueChange.symbol,
          breakEvenPrice: 0.011,
          totalQuantity: 11,
          unrealizedProfit: {
            amount: 0.011,
            percent: 0.011,
          },
          positions: [],
        };
      },
    },

    SymbolHolding: {},
  } satisfies Resolvers;
}
