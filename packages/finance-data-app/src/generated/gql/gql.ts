/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 */
const documents = {
    "\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n": types.HoldingStatsDataSubscriptionDocument,
    "\n  query PositionsQuery($symbol: ID!) {\n    positions(filters: { symbols: [$symbol] }) {\n      id\n    }\n  }\n": types.PositionsQueryDocument,
    "\n  subscription PositionDataSubscription($ids: [ID!]!) {\n    positions(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        openedAt\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n": types.PositionDataSubscriptionDocument,
    "\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n": types.SetTradesMutationDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = graphql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function graphql(source: string): unknown;

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PositionsQuery($symbol: ID!) {\n    positions(filters: { symbols: [$symbol] }) {\n      id\n    }\n  }\n"): (typeof documents)["\n  query PositionsQuery($symbol: ID!) {\n    positions(filters: { symbols: [$symbol] }) {\n      id\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription PositionDataSubscription($ids: [ID!]!) {\n    positions(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        openedAt\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription PositionDataSubscription($ids: [ID!]!) {\n    positions(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        openedAt\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n"): (typeof documents)["\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;