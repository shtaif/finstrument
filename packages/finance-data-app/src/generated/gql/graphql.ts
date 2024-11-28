/* eslint-disable */
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: any; output: any; }
};

export type AggregatePnlChangeResult = {
  __typename?: 'AggregatePnlChangeResult';
  aggregates: Array<AggregatePnlResultItem>;
  translatedAggregates: Array<AggregatePnlResultItemTranslated>;
};


export type AggregatePnlChangeResultTranslatedAggregatesArgs = {
  currencies: Array<Scalars['ID']['input']>;
};

export type AggregatePnlHoldingSpecifier = {
  symbol: Scalars['ID']['input'];
};

export type AggregatePnlLotSpecifier = {
  lotId: Scalars['ID']['input'];
};

export type AggregatePnlResultItem = {
  __typename?: 'AggregatePnlResultItem';
  currency?: Maybe<Scalars['ID']['output']>;
  pnlAmount: Scalars['Float']['output'];
  pnlPercent: Scalars['Float']['output'];
};

export type AggregatePnlResultItemTranslated = {
  __typename?: 'AggregatePnlResultItemTranslated';
  currency: Scalars['ID']['output'];
  pnlAmount: Scalars['Float']['output'];
};

export type CurrencyAdjustedPnlInfo = {
  __typename?: 'CurrencyAdjustedPnlInfo';
  amount: Scalars['Float']['output'];
  currency: Scalars['String']['output'];
  exchangeRate: Scalars['Float']['output'];
};

export type ExchangeInfo = {
  __typename?: 'ExchangeInfo';
  acronym?: Maybe<Scalars['String']['output']>;
  countryCode?: Maybe<Scalars['String']['output']>;
  fullName?: Maybe<Scalars['String']['output']>;
  mic?: Maybe<Scalars['String']['output']>;
};

export type HoldingRevenueChange = {
  __typename?: 'HoldingRevenueChange';
  holding: SymbolHolding;
  priceData: SymbolPriceData;
  revenue: RevenueInfo;
  symbol: Scalars['ID']['output'];
  userAlias: Scalars['ID']['output'];
};

export type HoldingRevenueChangeNotification = {
  __typename?: 'HoldingRevenueChangeNotification';
  changes: Array<HoldingRevenueChange>;
};

export type HoldingStats = {
  __typename?: 'HoldingStats';
  breakEvenPrice?: Maybe<Scalars['Float']['output']>;
  currentPortfolioPortion?: Maybe<Scalars['Float']['output']>;
  instrument: InstrumentInfo;
  lastChangedAt: Scalars['DateTime']['output'];
  lastRelatedTradeId: Scalars['ID']['output'];
  ownerId: Scalars['ID']['output'];
  relatedPortfolioStats: PortfolioStats;
  symbol: Scalars['ID']['output'];
  totalLotCount: Scalars['Int']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalQuantity: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
  unrealizedPnl: PnlInfo;
};

export type HoldingStatsChange = {
  __typename?: 'HoldingStatsChange';
  changedAt: Scalars['DateTime']['output'];
  ownerId: Scalars['ID']['output'];
  portfolioPortion: Scalars['Float']['output'];
  portfolioStatsChangeId: Scalars['ID']['output'];
  relatedPortfolioStatsChange: PortfolioStatsChange;
  relatedTradeId: Scalars['ID']['output'];
  symbol: Scalars['String']['output'];
  totalLotCount: Scalars['Int']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalQuantity: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
};

export type HoldingStatsChangesFilters = {
  symbols?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type HoldingStatsFilters = {
  symbols?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export enum HoldingStatsMarketState {
  Closed = 'CLOSED',
  Post = 'POST',
  Postpost = 'POSTPOST',
  Pre = 'PRE',
  Prepre = 'PREPRE',
  Regular = 'REGULAR'
}

export type HoldingStatsSubscriptionFilters = {
  symbols?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type InstrumentInfo = {
  __typename?: 'InstrumentInfo';
  currency?: Maybe<Scalars['String']['output']>;
  exchange: ExchangeInfo;
  marketState: HoldingStatsMarketState;
  name?: Maybe<Scalars['String']['output']>;
  regularMarketPrice: Scalars['Float']['output'];
  regularMarketTime: Scalars['DateTime']['output'];
  symbol: Scalars['ID']['output'];
};

export type InstrumentMarketData = {
  __typename?: 'InstrumentMarketData';
  currency?: Maybe<Scalars['String']['output']>;
  marketState: HoldingStatsMarketState;
  regularMarketPrice: Scalars['Float']['output'];
  regularMarketTime: Scalars['DateTime']['output'];
};

export type Lot = {
  __typename?: 'Lot';
  id: Scalars['ID']['output'];
  instrument: InstrumentInfo;
  openedAt: Scalars['DateTime']['output'];
  openingTradeId: Scalars['ID']['output'];
  ownerId: Scalars['ID']['output'];
  priceData: InstrumentMarketData;
  realizedProfitOrLoss: Scalars['Float']['output'];
  recordCreatedAt: Scalars['DateTime']['output'];
  recordUpdatedAt: Scalars['DateTime']['output'];
  remainingQuantity: Scalars['Float']['output'];
  symbol: Scalars['ID']['output'];
  unrealizedPnl: PnlInfo;
};

export type LotProfitInfo = {
  __typename?: 'LotProfitInfo';
  amount: Scalars['Float']['output'];
  percent: Scalars['Float']['output'];
};

export type LotsFilters = {
  ids?: InputMaybe<Array<Scalars['ID']['input']>>;
  symbols?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type LotsSubscriptionFilters = {
  ids: Array<Scalars['ID']['input']>;
};

export type MeInfo = {
  __typename?: 'MeInfo';
  user?: Maybe<User>;
};

export type Mutation = {
  __typename?: 'Mutation';
  setTrades: SetTradesResult;
};


export type MutationSetTradesArgs = {
  input: SetTradesInput;
};

export type ObserveHoldingRevenueInput = {
  userAlias: Scalars['ID']['input'];
};

export type ObservePricesDataInput = {
  symbols: Array<Scalars['String']['input']>;
};

export type ObservedCombinedPortfolioStats = {
  __typename?: 'ObservedCombinedPortfolioStats';
  compositionByHoldings: Array<ObservedCombinedPortfolioStatsCompositionByHoldingsItem>;
  costBasis: Scalars['Float']['output'];
  currencyCombinedBy: Scalars['String']['output'];
  lastChangedAt?: Maybe<Scalars['DateTime']['output']>;
  marketValue: Scalars['Float']['output'];
  mostRecentTradeId?: Maybe<Scalars['ID']['output']>;
  ownerId: Scalars['ID']['output'];
  realizedAmount: Scalars['Float']['output'];
  realizedPnlAmount: Scalars['Float']['output'];
  realizedPnlRate: Scalars['Float']['output'];
  unrealizedPnl: ObservedCombinedPortfolioStatsUnrealizedPnl;
};

export type ObservedCombinedPortfolioStatsCompositionByHoldingsItem = {
  __typename?: 'ObservedCombinedPortfolioStatsCompositionByHoldingsItem';
  portionOfPortfolioCostBasis: Scalars['Float']['output'];
  portionOfPortfolioMarketValue: Scalars['Float']['output'];
  portionOfPortfolioUnrealizedPnl: Scalars['Float']['output'];
  symbol: Scalars['String']['output'];
};

export type ObservedCombinedPortfolioStatsUnrealizedPnl = {
  __typename?: 'ObservedCombinedPortfolioStatsUnrealizedPnl';
  amount: Scalars['Float']['output'];
  fraction: Scalars['Float']['output'];
};

export type ObservedHoldingStats = {
  __typename?: 'ObservedHoldingStats';
  breakEvenPrice?: Maybe<Scalars['Float']['output']>;
  currentPortfolioPortion?: Maybe<Scalars['Float']['output']>;
  lastChangedAt: Scalars['DateTime']['output'];
  lastRelatedTradeId: Scalars['ID']['output'];
  marketValue: Scalars['Float']['output'];
  ownerId: Scalars['ID']['output'];
  priceData: InstrumentMarketData;
  symbol: Scalars['ID']['output'];
  totalLotCount: Scalars['Int']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalQuantity: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
  unrealizedPnl: PnlInfo;
};

export type ObservedHoldingStatsUpdate = {
  __typename?: 'ObservedHoldingStatsUpdate';
  data: ObservedHoldingStats;
  type: ObservedHoldingStatsUpdateType;
};

export enum ObservedHoldingStatsUpdateType {
  Remove = 'REMOVE',
  Set = 'SET'
}

export type ObservedLot = {
  __typename?: 'ObservedLot';
  id: Scalars['ID']['output'];
  marketValue: Scalars['Float']['output'];
  openedAt: Scalars['DateTime']['output'];
  openingTradeId: Scalars['ID']['output'];
  originalQuantity: Scalars['Float']['output'];
  ownerId: Scalars['ID']['output'];
  priceData: InstrumentMarketData;
  realizedProfitOrLoss: Scalars['Float']['output'];
  recordCreatedAt: Scalars['DateTime']['output'];
  recordUpdatedAt: Scalars['DateTime']['output'];
  remainingQuantity: Scalars['Float']['output'];
  symbol: Scalars['ID']['output'];
  unrealizedPnl: PnlInfo;
};

export type ObservedLotUpdate = {
  __typename?: 'ObservedLotUpdate';
  data: ObservedLot;
  type: ObservedLotUpdateType;
};

export enum ObservedLotUpdateType {
  Remove = 'REMOVE',
  Set = 'SET'
}

export type ObservedPortfolioStats = {
  __typename?: 'ObservedPortfolioStats';
  forCurrency?: Maybe<Scalars['String']['output']>;
  lastChangedAt: Scalars['DateTime']['output'];
  marketValue: Scalars['Float']['output'];
  ownerId: Scalars['ID']['output'];
  relatedTradeId: Scalars['ID']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
  unrealizedPnl: PnlInfo;
};

export type ObservedPortfolioStatsUpdate = {
  __typename?: 'ObservedPortfolioStatsUpdate';
  data: ObservedPortfolioStats;
  type: ObservedPortfolioStatsUpdateType;
};

export enum ObservedPortfolioStatsUpdateType {
  Remove = 'REMOVE',
  Set = 'SET'
}

export type PnlInfo = {
  __typename?: 'PnlInfo';
  amount: Scalars['Float']['output'];
  currencyAdjusted: CurrencyAdjustedPnlInfo;
  percent: Scalars['Float']['output'];
};


export type PnlInfoCurrencyAdjustedArgs = {
  currency: Scalars['String']['input'];
};

export type PortfolioStats = {
  __typename?: 'PortfolioStats';
  composition: Array<SymbolPortfolioPortion>;
  forCurrency?: Maybe<Scalars['String']['output']>;
  lastChangedAt: Scalars['DateTime']['output'];
  ownerId: Scalars['ID']['output'];
  relatedHoldingStats: HoldingStats;
  relatedTradeId: Scalars['ID']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
  unrealizedPnl: PnlInfo;
};

export type PortfolioStatsChange = {
  __typename?: 'PortfolioStatsChange';
  changedAt: Scalars['DateTime']['output'];
  composition: Array<SymbolPortfolioPortion>;
  forCurrency?: Maybe<Scalars['String']['output']>;
  ownerId: Scalars['ID']['output'];
  relatedHoldingStatsChange: HoldingStatsChange;
  relatedTradeId: Scalars['ID']['output'];
  totalPresentInvestedAmount: Scalars['Float']['output'];
  totalRealizedAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossAmount: Scalars['Float']['output'];
  totalRealizedProfitOrLossRate: Scalars['Float']['output'];
};

export type PriceDataChangeNotification = {
  __typename?: 'PriceDataChangeNotification';
  priceUpdates: Array<SymbolPriceData>;
};

export type Query = {
  __typename?: 'Query';
  getSymbolHoldingForTest: HoldingRevenueChangeNotification;
  getSymbolPriceDataForTest: SymbolPriceData;
  hello: Scalars['String']['output'];
  holdingStats: Array<HoldingStats>;
  holdingStatsChanges: Array<HoldingStatsChange>;
  lots: Array<Lot>;
  me: MeInfo;
  portfolioStats: PortfolioStats;
  portfolioStatsChanges: Array<PortfolioStatsChange>;
};


export type QueryHoldingStatsArgs = {
  filters?: InputMaybe<HoldingStatsFilters>;
};


export type QueryHoldingStatsChangesArgs = {
  filters?: InputMaybe<HoldingStatsChangesFilters>;
};


export type QueryLotsArgs = {
  filters?: InputMaybe<LotsFilters>;
};

export type RevenueInfo = {
  __typename?: 'RevenueInfo';
  amount: Scalars['Float']['output'];
  percent: Scalars['Float']['output'];
};

export type SetTradesInput = {
  data: SetTradesInputData;
  mode: SetTradesInputMode;
};

export type SetTradesInputData = {
  csv: Scalars['String']['input'];
};

export enum SetTradesInputMode {
  Merge = 'MERGE',
  Replace = 'REPLACE'
}

export type SetTradesResult = {
  __typename?: 'SetTradesResult';
  tradesAddedCount: Scalars['Int']['output'];
  tradesModifiedCount: Scalars['Int']['output'];
  tradesRemovedCount: Scalars['Int']['output'];
};

export type Subscription = {
  __typename?: 'Subscription';
  aggregatePnl: AggregatePnlChangeResult;
  combinedPortfolioStats: ObservedCombinedPortfolioStats;
  holdingStats: Array<ObservedHoldingStatsUpdate>;
  lots: Array<ObservedLotUpdate>;
  observeHoldingRevenue: HoldingRevenueChangeNotification;
  observePricesData: PriceDataChangeNotification;
  portfolioStats: Array<ObservedPortfolioStatsUpdate>;
};


export type SubscriptionAggregatePnlArgs = {
  holdings?: InputMaybe<Array<AggregatePnlHoldingSpecifier>>;
  lots?: InputMaybe<Array<AggregatePnlLotSpecifier>>;
};


export type SubscriptionCombinedPortfolioStatsArgs = {
  currencyToCombineIn?: InputMaybe<Scalars['String']['input']>;
};


export type SubscriptionHoldingStatsArgs = {
  filters?: InputMaybe<HoldingStatsSubscriptionFilters>;
};


export type SubscriptionLotsArgs = {
  filters: LotsSubscriptionFilters;
};


export type SubscriptionObserveHoldingRevenueArgs = {
  input: ObserveHoldingRevenueInput;
};


export type SubscriptionObservePricesDataArgs = {
  input: ObservePricesDataInput;
};

export type SymbolHolding = {
  __typename?: 'SymbolHolding';
  breakEvenPrice: Scalars['Float']['output'];
  lots: Array<SymbolLot>;
  symbol: Scalars['ID']['output'];
  totalQuantity: Scalars['Float']['output'];
  unrealizedProfit: LotProfitInfo;
  userAlias: Scalars['ID']['output'];
};

export type SymbolLot = {
  __typename?: 'SymbolLot';
  createdAt: Scalars['DateTime']['output'];
  isRealized: Scalars['Boolean']['output'];
  price: Scalars['Float']['output'];
  quantity: Scalars['Int']['output'];
  realizedQuantity: Scalars['Int']['output'];
};

export type SymbolPortfolioPortion = {
  __typename?: 'SymbolPortfolioPortion';
  portion: Scalars['Float']['output'];
  symbol: Scalars['ID']['output'];
};

export type SymbolPriceData = {
  __typename?: 'SymbolPriceData';
  regularMarketPrice: Scalars['Float']['output'];
  regularMarketTime: Scalars['DateTime']['output'];
  symbol: Scalars['ID']['output'];
};

export type User = {
  __typename?: 'User';
  alias: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type SetTradesMutationMutationVariables = Exact<{
  input: SetTradesInput;
}>;


export type SetTradesMutationMutation = { __typename?: 'Mutation', setTrades: { __typename?: 'SetTradesResult', tradesAddedCount: number, tradesModifiedCount: number, tradesRemovedCount: number } };

export type HoldingStatsDataSubscriptionSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type HoldingStatsDataSubscriptionSubscription = { __typename?: 'Subscription', holdingStats: Array<{ __typename?: 'ObservedHoldingStatsUpdate', type: ObservedHoldingStatsUpdateType, data: { __typename?: 'ObservedHoldingStats', symbol: string, totalQuantity: number, breakEvenPrice?: number | null, marketValue: number, priceData: { __typename?: 'InstrumentMarketData', marketState: HoldingStatsMarketState, regularMarketTime: any, regularMarketPrice: number, currency?: string | null }, unrealizedPnl: { __typename?: 'PnlInfo', amount: number, percent: number } } }> };

export type PortfolioStatsDataSubscriptionSubscriptionVariables = Exact<{
  currencyToCombineIn: Scalars['String']['input'];
}>;


export type PortfolioStatsDataSubscriptionSubscription = { __typename?: 'Subscription', combinedPortfolioStats: { __typename?: 'ObservedCombinedPortfolioStats', currencyCombinedBy: string, costBasis: number, marketValue: number, unrealizedPnl: { __typename?: 'ObservedCombinedPortfolioStatsUnrealizedPnl', amount: number, fraction: number }, compositionByHoldings: Array<{ __typename?: 'ObservedCombinedPortfolioStatsCompositionByHoldingsItem', symbol: string, portionOfPortfolioMarketValue: number }> } };

export type LotsQueryQueryVariables = Exact<{
  symbol: Scalars['ID']['input'];
}>;


export type LotsQueryQuery = { __typename?: 'Query', lots: Array<{ __typename?: 'Lot', id: string }> };

export type LotDataSubscriptionSubscriptionVariables = Exact<{
  ids: Array<Scalars['ID']['input']> | Scalars['ID']['input'];
}>;


export type LotDataSubscriptionSubscription = { __typename?: 'Subscription', lots: Array<{ __typename?: 'ObservedLotUpdate', type: ObservedLotUpdateType, data: { __typename?: 'ObservedLot', id: string, openedAt: any, originalQuantity: number, remainingQuantity: number, unrealizedPnl: { __typename?: 'PnlInfo', amount: number, percent: number } } }> };


export const SetTradesMutationDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"SetTradesMutation"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"SetTradesInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"setTrades"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"tradesAddedCount"}},{"kind":"Field","name":{"kind":"Name","value":"tradesModifiedCount"}},{"kind":"Field","name":{"kind":"Name","value":"tradesRemovedCount"}}]}}]}}]} as unknown as DocumentNode<SetTradesMutationMutation, SetTradesMutationMutationVariables>;
export const HoldingStatsDataSubscriptionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"HoldingStatsDataSubscription"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"holdingStats"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"data"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"totalQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"breakEvenPrice"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"priceData"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"marketState"}},{"kind":"Field","name":{"kind":"Name","value":"regularMarketTime"}},{"kind":"Field","name":{"kind":"Name","value":"regularMarketPrice"}},{"kind":"Field","name":{"kind":"Name","value":"currency"}}]}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPnl"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"percent"}}]}}]}}]}}]}}]} as unknown as DocumentNode<HoldingStatsDataSubscriptionSubscription, HoldingStatsDataSubscriptionSubscriptionVariables>;
export const PortfolioStatsDataSubscriptionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"PortfolioStatsDataSubscription"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"currencyToCombineIn"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"combinedPortfolioStats"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"currencyToCombineIn"},"value":{"kind":"Variable","name":{"kind":"Name","value":"currencyToCombineIn"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"currencyCombinedBy"}},{"kind":"Field","name":{"kind":"Name","value":"costBasis"}},{"kind":"Field","name":{"kind":"Name","value":"marketValue"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPnl"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"fraction"}}]}},{"kind":"Field","name":{"kind":"Name","value":"compositionByHoldings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"symbol"}},{"kind":"Field","name":{"kind":"Name","value":"portionOfPortfolioMarketValue"}}]}}]}}]}}]} as unknown as DocumentNode<PortfolioStatsDataSubscriptionSubscription, PortfolioStatsDataSubscriptionSubscriptionVariables>;
export const LotsQueryDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"LotsQuery"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"symbol"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"lots"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"symbols"},"value":{"kind":"ListValue","values":[{"kind":"Variable","name":{"kind":"Name","value":"symbol"}}]}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}}]}}]}}]} as unknown as DocumentNode<LotsQueryQuery, LotsQueryQueryVariables>;
export const LotDataSubscriptionDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"subscription","name":{"kind":"Name","value":"LotDataSubscription"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"ids"}},"type":{"kind":"NonNullType","type":{"kind":"ListType","type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"ID"}}}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"lots"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"ObjectValue","fields":[{"kind":"ObjectField","name":{"kind":"Name","value":"ids"},"value":{"kind":"Variable","name":{"kind":"Name","value":"ids"}}}]}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"type"}},{"kind":"Field","name":{"kind":"Name","value":"data"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"openedAt"}},{"kind":"Field","name":{"kind":"Name","value":"originalQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"remainingQuantity"}},{"kind":"Field","name":{"kind":"Name","value":"unrealizedPnl"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"amount"}},{"kind":"Field","name":{"kind":"Name","value":"percent"}}]}}]}}]}}]}}]} as unknown as DocumentNode<LotDataSubscriptionSubscription, LotDataSubscriptionSubscriptionVariables>;