import {
  createHoldingMarketDataLoader,
  type HoldingMarketStats,
} from './loaders/createHoldingMarketDataLoader.js';
import { createLiveHoldingMarketDataLoader } from './loaders/createLiveHoldingMarketDataLoader.js';
import { createPortfolioStatsLoader } from './loaders/createPortfolioStatsLoader.js';
import { createPortfolioStatsChangesLoader } from './loaders/createPortfolioStatsChangesLoader.js';
import { createHoldingStatsChangesLoader } from './loaders/createHoldingStatsChangesLoader.js';
import {
  createPositionMarketDataLoader,
  type PositionPnlUpdate,
} from './loaders/createPositionMarketDataLoader.js';
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
  type PositionPnlUpdate,
  type InstrumentInfo,
  type UpdatedSymbolPrice,
};

const appGqlContext = async (injectedInfo?: {
  activeUserId?: string;
}): Promise<{
  session: {
    activeUserId: string | undefined;
  };
  /** @deprecated need to use the `session` property instead */
  activeUser?: { id: string };
  portfolioStatsLoader: ReturnType<typeof createPortfolioStatsLoader>;
  portfolioStatsChangesLoader: ReturnType<typeof createPortfolioStatsChangesLoader>;
  holdingStatsChangesLoader: ReturnType<typeof createHoldingStatsChangesLoader>;
  liveHoldingMarketDataLoader: ReturnType<typeof createLiveHoldingMarketDataLoader>;
  holdingMarketDataLoader: ReturnType<typeof createHoldingMarketDataLoader>;
  positionMarketDataLoader: ReturnType<typeof createPositionMarketDataLoader>;
  // positionLiveMarketDataLoader: ReturnType<typeof createHoldingMarketDataLoader>;
  instrumentInfoLoader: ReturnType<typeof createInstrumentInfoLoader>;
  instrumentCurrentMarketDataLoader: ReturnType<typeof createInstrumentCurrentMarketDataLoader>;
  // observedStatsObjectsLoader: ReturnType<typeof createObservedStatsObjectsLoader>;
}> => {
  const portfolioStatsLoader = createPortfolioStatsLoader();
  const portfolioStatsChangesLoader = createPortfolioStatsChangesLoader();
  const holdingStatsChangesLoader = createHoldingStatsChangesLoader();
  const liveHoldingMarketDataLoader = createLiveHoldingMarketDataLoader();
  const holdingMarketDataLoader = createHoldingMarketDataLoader();
  const positionMarketDataLoader = createPositionMarketDataLoader();
  const instrumentInfoLoader = createInstrumentInfoLoader();
  const instrumentCurrentMarketDataLoader = createInstrumentCurrentMarketDataLoader();
  // const observedStatsObjectsLoader = createObservedStatsObjectsLoader();

  return {
    session: {
      activeUserId: injectedInfo?.activeUserId,
    },
    portfolioStatsLoader,
    portfolioStatsChangesLoader,
    holdingStatsChangesLoader,
    positionMarketDataLoader,
    liveHoldingMarketDataLoader,
    holdingMarketDataLoader,
    instrumentInfoLoader,
    instrumentCurrentMarketDataLoader,
    // observedStatsObjectsLoader,
  };
};

type AppGqlContextValue = Awaited<ReturnType<typeof appGqlContext>>;
