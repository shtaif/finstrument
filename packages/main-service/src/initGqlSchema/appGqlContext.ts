import type http from 'node:http';
import { once } from 'lodash-es';
import Session from 'supertokens-node/recipe/session';
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

const appGqlContext = async (injectedInfo: {
  req: http.IncomingMessage;
  res?: http.OutgoingMessage;
}): Promise<{
  getSession: () => Promise<{ activeUserId: string | undefined }>;
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
  const getSession = once(async () => {
    const { req, res } = injectedInfo;
    const supertokensSession = await Session.getSession(req, res ?? {}, { sessionRequired: false });
    const userId = supertokensSession?.getUserId();
    return {
      activeUserId: userId,
    };
  });

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
    getSession,
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
