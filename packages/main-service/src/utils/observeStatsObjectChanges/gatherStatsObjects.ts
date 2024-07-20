import { differenceWith, groupBy } from 'lodash';
import { CustomError, asyncPipe, pipe } from 'shared-utils';
import {
  positionsService,
  type PortfolioStatsChange,
  type HoldingStats,
  type Position,
} from '../positionsService/index.js';
import { getInstrumentInfos, type InstrumentInfo } from '../getInstrumentInfos/index.js';

export { gatherStatsObjects, type StatsObjects, type StatsObjectsArray };

async function gatherStatsObjects(params: {
  portfolioStats: { portfolioOwnerId: string; statsCurrency?: string | null | undefined }[];
  holdingStats: { holdingPortfolioOwnerId: string; holdingSymbol?: string }[];
  positions: { positionId: string }[];
  discardOverlapping?: boolean;
}): Promise<StatsObjectsArray> {
  const [portfolioStats, holdingStats, positions] = await Promise.all([
    gatherPortfolioStats(params.portfolioStats),
    gatherHoldingStats(params.holdingStats),
    gatherPositions(params.positions),
  ]);

  const symbolInfos = await getInstrumentInfos({
    symbols: [
      ...holdingStats.map(({ symbol }) => symbol),
      ...positions.map(({ symbol }) => symbol),
    ],
  });

  const [holdingStatsWithSymInfos, positionsWithSymInfos] = [
    holdingStats.map(h => ({ ...h, symbolInfo: symbolInfos[h.symbol] })),
    positions.map(p => ({ ...p, symbolInfo: symbolInfos[p.symbol] })),
  ];

  const result = (() => {
    if (!params.discardOverlapping) {
      return [portfolioStats, holdingStatsWithSymInfos, positionsWithSymInfos] as const;
    }

    const holdingsNonOverlapping = holdingStatsWithSymInfos.filter(
      h =>
        !portfolioStats.some(
          ps => ps.ownerId === h.ownerId && ps.forCurrency === h.symbolInfo.currency
        )
    );
    const positionsNonOverlapping = positionsWithSymInfos.filter(
      pos =>
        !holdingsNonOverlapping.some(h => h.ownerId === pos.ownerId && h.symbol === pos.symbol) &&
        !portfolioStats.some(
          p => p.ownerId === pos.ownerId && p.forCurrency === pos.symbolInfo.currency
        )
    );

    return [portfolioStats, holdingsNonOverlapping, positionsNonOverlapping] as const;
  })();

  const portfolioResolvedHoldingsMap = await asyncPipe(
    !result[0].length
      ? []
      : await positionsService.retrieveHoldingStats({
          filters: {
            ownerIds: result[0].map(({ ownerId }) => ownerId),
          },
        }),
    async v => {
      const symbols = v.map(({ symbol }) => symbol);
      const symbolInfos = await getInstrumentInfos({ symbols });
      return pipe(
        v,
        v => v.map(h => ({ ...h, symbolInfo: symbolInfos[h.symbol] })),
        v => groupBy(v, h => `${h.ownerId}_${h.symbolInfo.currency ?? ''}`)
      );
    }
  );

  const portfolioStatsWithResolvedHoldings = result[0].map(portfolioStats => ({
    ...portfolioStats,
    resolvedHoldings:
      portfolioResolvedHoldingsMap[
        `${portfolioStats.ownerId}_${portfolioStats.forCurrency ?? ''}`
      ] ?? [],
  }));

  return [portfolioStatsWithResolvedHoldings, result[1], result[2]];
}

async function gatherPortfolioStats(
  portfolioStatsSpecifiers: {
    portfolioOwnerId: string;
    statsCurrency?: string | null | undefined;
  }[]
): Promise<PortfolioStatsChange<true, false>[]> {
  return !portfolioStatsSpecifiers.length
    ? []
    : await positionsService.retrievePortfolioStatsChanges({
        latestPerOwner: true,
        filters: {
          or: portfolioStatsSpecifiers.map(({ portfolioOwnerId, statsCurrency }) => ({
            ownerIds: [portfolioOwnerId],
            forCurrencies: statsCurrency ? [statsCurrency] : [],
          })),
        },
      });
}

async function gatherHoldingStats(
  holdingStatsSpecifiers: {
    holdingPortfolioOwnerId: string;
    holdingSymbol?: string;
  }[]
): Promise<HoldingStats[]> {
  return !holdingStatsSpecifiers.length
    ? []
    : await positionsService.retrieveHoldingStats({
        filters: {
          or: holdingStatsSpecifiers.map(({ holdingPortfolioOwnerId, holdingSymbol }) => ({
            ownerIds: [holdingPortfolioOwnerId],
            symbols: holdingSymbol ? [holdingSymbol] : undefined,
          })),
        },
      });
}

async function gatherPositions(
  positionSpecifiers: {
    positionId: string;
  }[]
): Promise<Position[]> {
  const positions = !positionSpecifiers.length
    ? []
    : await positionsService.retrievePositions({
        filters: {
          ids: positionSpecifiers.map(({ positionId }) => positionId),
        },
      });

  if (positions.length < positionSpecifiers.length) {
    const positionIdsGiven = positionSpecifiers.map(({ positionId }) => positionId);
    const unmatchedPositionsIds = differenceWith(
      positionIdsGiven,
      positions,
      (askedPosId, pos) => askedPosId === pos.id
    );
    throw new CustomError({
      message:
        `Some of the requested positions could not be found (${unmatchedPositionsIds.length} in total):\n${unmatchedPositionsIds.map(id => `ID "${id}"`).join(',\n')}` as const,
      type: 'INVALID_POSITION_IDS',
      details: {
        positionIdsGiven,
        unmatchedPositionsIds,
      },
    } as const);
  }

  return positions;
}

type StatsObjectsArray = readonly [
  portfolioStats: StatsObjects['portfolioStatsChanges'][string][],
  holdingStats: StatsObjects['holdingStatsChanges'][string][],
  positions: StatsObjects['positionChanges'][string][],
];

type StatsObjects = {
  portfolioStatsChanges: {
    [ownerAndCurrency: string]: PortfolioStatsChange<true, false> & {
      resolvedHoldings: (HoldingStats & {
        symbolInfo: InstrumentInfo;
      })[];
    };
  };
  holdingStatsChanges: {
    [ownerAndSymbol: string]: HoldingStats & { symbolInfo: InstrumentInfo };
  };
  positionChanges: {
    [posId: string]: Position & { symbolInfo: InstrumentInfo };
  };
};
