import { retrievePositions, type Position } from './retrievePositions/index.js';
import { retrieveHoldingStats, type HoldingStats } from './retrieveHoldingStats/index.js';
import {
  retrieveHoldingStatsChanges,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
} from './retrieveHoldingStatsChanges/index.js';
import {
  retrievePortfolioStatsChanges,
  type RetrievePortfolioStatsChangesParams,
  type PortfolioStatsChange,
} from './retrievePortfolioStatsChanges/index.js';
import { setPositions } from './setPositions/index.js';
import { observePositionChanges } from './observePositionChanges/index.js';
// import observeHoldingChanges, {
//   type ChangedHoldings,
//   type ChangedHoldingItem,
//   type IndividualHoldingItem,
// } from './observeHoldingChanges___';
import { observeHoldingChanges } from './observeHoldingChanges/index.js';
import { observePortfolioChanges, type ChangedPortfolio } from './observePortfolioChanges/index.js';
import { type PositionRecord } from './positionRecordSchema.js';

const positionsService = {
  retrievePositions,
  retrieveHoldingStats,
  retrieveHoldingStatsChanges,
  retrievePortfolioStatsChanges,
  setPositions,
  observePositionChanges,
  observeHoldingChanges,
  observePortfolioChanges,
};

export {
  positionsService as default, // TODO: Remove this default export project-wide in favor of the named `positionsService` one below
  positionsService,
  type Position,
  type PositionRecord,
  type ChangedPortfolio,
  type HoldingStats,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
  type RetrievePortfolioStatsChangesParams,
  type PortfolioStatsChange,
};
