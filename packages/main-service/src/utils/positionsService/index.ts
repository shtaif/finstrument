import { retrieveLots, type Lot } from './retrieveLots/index.js';
import { retrieveHoldingStats, type HoldingStats } from './retrieveHoldingStats/index.js';
import {
  retrieveHoldingStatsChanges,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
} from './retrieveHoldingStatsChanges/index.js';
import {
  retrieveCurrencyStatsChanges,
  type RetrieveCurrencyStatsChangesParams,
  type CurrencyStatsChange,
} from './retrieveCurrencyStatsChanges/index.js';
import { setPositions } from './setPositions/index.js';
import { type PositionRecord } from './positionRecordSchema.js';

const positionsService = {
  retrieveLots,
  retrieveHoldingStats,
  retrieveHoldingStatsChanges,
  retrieveCurrencyStatsChanges,
  setPositions,
};

export {
  positionsService as default, // TODO: Remove this default export project-wide in favor of the named `positionsService` one below
  positionsService,
  type Lot,
  type PositionRecord,
  type HoldingStats,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
  type RetrieveCurrencyStatsChangesParams,
  type CurrencyStatsChange,
};
