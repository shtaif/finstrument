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
    "\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n": types.SetTradesMutationDocument,
    "\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        marketValue\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n": types.HoldingStatsDataSubscriptionDocument,
    "\n  query CountryLocaleCurrencyQuery($countryCode: ID!) {\n    countryLocale(countryCode: $countryCode) {\n      currencyCode\n    }\n  }\n": types.CountryLocaleCurrencyQueryDocument,
    "\n  subscription PortfolioStatsDataSubscription($currencyToCombineIn: String!) {\n    combinedPortfolioStats(currencyToCombineIn: $currencyToCombineIn) {\n      currencyCombinedBy\n      costBasis\n      marketValue\n      unrealizedPnl {\n        amount\n        fraction\n      }\n      compositionByHoldings {\n        symbol\n        portionOfPortfolioMarketValue\n      }\n    }\n  }\n": types.PortfolioStatsDataSubscriptionDocument,
    "\n  query LotsQuery($symbol: ID!) {\n    lots(filters: { symbols: [$symbol] }) {\n      id\n      openedAt\n    }\n  }\n": types.LotsQueryDocument,
    "\n  subscription LotDataSubscription($ids: [ID!]!) {\n    lots(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n": types.LotDataSubscriptionDocument,
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
export function graphql(source: "\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n"): (typeof documents)["\n  mutation SetTradesMutation($input: SetTradesInput!) {\n    setTrades(input: $input) {\n      tradesAddedCount\n      tradesModifiedCount\n      tradesRemovedCount\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        marketValue\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription HoldingStatsDataSubscription {\n    holdingStats {\n      type\n      data {\n        symbol\n        totalQuantity\n        breakEvenPrice\n        marketValue\n        priceData {\n          marketState\n          regularMarketTime\n          regularMarketPrice\n          currency\n        }\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query CountryLocaleCurrencyQuery($countryCode: ID!) {\n    countryLocale(countryCode: $countryCode) {\n      currencyCode\n    }\n  }\n"): (typeof documents)["\n  query CountryLocaleCurrencyQuery($countryCode: ID!) {\n    countryLocale(countryCode: $countryCode) {\n      currencyCode\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription PortfolioStatsDataSubscription($currencyToCombineIn: String!) {\n    combinedPortfolioStats(currencyToCombineIn: $currencyToCombineIn) {\n      currencyCombinedBy\n      costBasis\n      marketValue\n      unrealizedPnl {\n        amount\n        fraction\n      }\n      compositionByHoldings {\n        symbol\n        portionOfPortfolioMarketValue\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription PortfolioStatsDataSubscription($currencyToCombineIn: String!) {\n    combinedPortfolioStats(currencyToCombineIn: $currencyToCombineIn) {\n      currencyCombinedBy\n      costBasis\n      marketValue\n      unrealizedPnl {\n        amount\n        fraction\n      }\n      compositionByHoldings {\n        symbol\n        portionOfPortfolioMarketValue\n      }\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query LotsQuery($symbol: ID!) {\n    lots(filters: { symbols: [$symbol] }) {\n      id\n      openedAt\n    }\n  }\n"): (typeof documents)["\n  query LotsQuery($symbol: ID!) {\n    lots(filters: { symbols: [$symbol] }) {\n      id\n      openedAt\n    }\n  }\n"];
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription LotDataSubscription($ids: [ID!]!) {\n    lots(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"): (typeof documents)["\n  subscription LotDataSubscription($ids: [ID!]!) {\n    lots(filters: { ids: $ids }) {\n      type\n      data {\n        id\n        originalQuantity\n        remainingQuantity\n        unrealizedPnl {\n          amount\n          percent\n        }\n      }\n    }\n  }\n"];

export function graphql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;