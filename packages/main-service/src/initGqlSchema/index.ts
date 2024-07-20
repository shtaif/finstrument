import { readFile } from 'node:fs/promises';
import { GraphQLSchema } from 'graphql/index.js';
import { entries } from 'lodash';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { z } from 'zod';
import { makeExecutableSchema } from '@graphql-tools/schema';
import type { Resolvers } from '../generated/graphql-schema.d.ts';
import observePricesData from '../utils/observePricesData/index.js';
import { appGqlContext } from './appGqlContext.js';
import { resolvers as portfolioStatsResolvers } from './schema/PortfolioStats/resolvers.js';
import { resolvers as portfolioStatsChangesResolvers } from './schema/PortfolioStatsChange/resolvers.js';
import { resolvers as holdingStatsResolvers } from './schema/HoldingStats/resolvers.js';
import { resolvers as holdingStatsChangesResolvers } from './schema/HoldingStatsChanges/resolvers.js';
import { resolvers as positionResolvers } from './schema/Position/resolvers.js';
import { resolvers as instrumentInfoResolvers } from './schema/InstrumentInfo/resolvers.js';
import { resolvers as aggregatePnlResolvers } from './schema/AggregatePnl/resolvers.js';
import { resolvers as observedPortfolioStatsResolvers } from './schema/ObservedPortfolioStats/resolvers.js';
import { resolvers as observedHoldingStatsResolvers } from './schema/ObservedHoldingStats/resolvers.js';
import { resolvers as observedPositionsResolvers } from './schema/ObservedPositions/resolvers.js';
import { resolvers as setTradesResultResolvers } from './schema/SetTradesResult/resolvers.js';

export { initedGqlSchema, appGqlContext };

const initedGqlSchema: GraphQLSchema = await (async () => {
  return makeExecutableSchema({
    typeDefs: await Promise.all(
      [
        `${import.meta.dirname}/schema/common.graphql`,
        `${import.meta.dirname}/schema/schema.graphql`,
        `${import.meta.dirname}/schema/PortfolioStats/schema.graphql`,
        `${import.meta.dirname}/schema/PortfolioStatsChange/schema.graphql`,
        `${import.meta.dirname}/schema/HoldingStats/schema.graphql`,
        `${import.meta.dirname}/schema/HoldingStatsChanges/schema.graphql`,
        `${import.meta.dirname}/schema/Position/schema.graphql`,
        `${import.meta.dirname}/schema/SymbolPortfolioPortion/schema.graphql`,
        `${import.meta.dirname}/schema/InstrumentInfo/schema.graphql`,
        `${import.meta.dirname}/schema/AggregatePnl/schema.graphql`,
        `${import.meta.dirname}/schema/ObservedPortfolioStats/schema.graphql`,
        `${import.meta.dirname}/schema/ObservedHoldingStats/schema.graphql`,
        `${import.meta.dirname}/schema/ObservedPositions/schema.graphql`,
        `${import.meta.dirname}/schema/SetTradesResult/schema.graphql`,
      ].map(defsFilepath => readFile(defsFilepath, 'utf-8'))
    ),
    resolvers: [
      olderAndProbablyUnusedResolversNeedToSortOut(),
      portfolioStatsResolvers,
      portfolioStatsChangesResolvers,
      holdingStatsResolvers,
      holdingStatsChangesResolvers,
      positionResolvers,
      instrumentInfoResolvers,
      aggregatePnlResolvers,
      observedPortfolioStatsResolvers,
      observedHoldingStatsResolvers,
      observedPositionsResolvers,
      setTradesResultResolvers,
    ],
  });
})();

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
        // const positions = await positionsService.retrievePositions({ filters: { userAlias } });
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
