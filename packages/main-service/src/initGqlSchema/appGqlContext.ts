import { once } from 'lodash-es';
import {
  createHoldingMarketDataLoader,
  type HoldingMarketStats,
} from './loaders/createHoldingMarketDataLoader.js';
import { createLiveHoldingMarketDataLoader } from './loaders/createLiveHoldingMarketDataLoader.js';
import { createPortfolioStatsLoader } from './loaders/createPortfolioStatsLoader.js';
import { createPortfolioStatsChangesLoader } from './loaders/createPortfolioStatsChangesLoader.js';
import { createHoldingStatsChangesLoader } from './loaders/createHoldingStatsChangesLoader.js';
import {
  createLotMarketDataLoader,
  type LotPnlUpdate,
} from './loaders/createLotMarketDataLoader.js';
import {
  createInstrumentInfoLoader,
  type InstrumentInfo,
} from './loaders/createInstrumentInfoLoader.js';
import {
  createInstrumentCurrentMarketDataLoader,
  type UpdatedSymbolPrice,
} from './loaders/createInstrumentCurrentMarketDataLoader.js';
// import {
//   createObservedStatsObjectsLoader,
//   // type InstrumentInfo,
// } from './loaders/createObservedStatsObjectsLoader.js';

export {
  appGqlContext,
  type AppGqlContextValue,
  type HoldingMarketStats,
  type LotPnlUpdate,
  type InstrumentInfo,
  type UpdatedSymbolPrice,
};

const appGqlContext = async (injectedInfo: {
  getSession: () => Promise<{ activeUserId: string | undefined }>;
}): Promise<{
  getSession: () => Promise<{ activeUserId: string | undefined }>;
  portfolioStatsLoader: ReturnType<typeof createPortfolioStatsLoader>;
  portfolioStatsChangesLoader: ReturnType<typeof createPortfolioStatsChangesLoader>;
  holdingStatsChangesLoader: ReturnType<typeof createHoldingStatsChangesLoader>;
  liveHoldingMarketDataLoader: ReturnType<typeof createLiveHoldingMarketDataLoader>;
  holdingMarketDataLoader: ReturnType<typeof createHoldingMarketDataLoader>;
  lotMarketDataLoader: ReturnType<typeof createLotMarketDataLoader>;
  // positionLiveMarketDataLoader: ReturnType<typeof createHoldingMarketDataLoader>;
  instrumentInfoLoader: ReturnType<typeof createInstrumentInfoLoader>;
  instrumentCurrentMarketDataLoader: ReturnType<typeof createInstrumentCurrentMarketDataLoader>;
  // observedStatsObjectsLoader: ReturnType<typeof createObservedStatsObjectsLoader>;
}> => {
  const getSession = once(async () => await injectedInfo.getSession());

  const portfolioStatsLoader = createPortfolioStatsLoader();
  const portfolioStatsChangesLoader = createPortfolioStatsChangesLoader();
  const holdingStatsChangesLoader = createHoldingStatsChangesLoader();
  const liveHoldingMarketDataLoader = createLiveHoldingMarketDataLoader();
  const holdingMarketDataLoader = createHoldingMarketDataLoader();
  const lotMarketDataLoader = createLotMarketDataLoader();
  const instrumentInfoLoader = createInstrumentInfoLoader();
  const instrumentCurrentMarketDataLoader = createInstrumentCurrentMarketDataLoader();
  // const observedStatsObjectsLoader = createObservedStatsObjectsLoader();

  return {
    getSession,
    portfolioStatsLoader,
    portfolioStatsChangesLoader,
    holdingStatsChangesLoader,
    lotMarketDataLoader,
    liveHoldingMarketDataLoader,
    holdingMarketDataLoader,
    instrumentInfoLoader,
    instrumentCurrentMarketDataLoader,
    // observedStatsObjectsLoader,
  };
};

type AppGqlContextValue = Awaited<ReturnType<typeof appGqlContext>>;
