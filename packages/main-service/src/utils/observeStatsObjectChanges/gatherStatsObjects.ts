import { differenceWith, groupBy } from 'lodash-es';
import { CustomError, asyncPipe, pipe } from 'shared-utils';
import {
  positionsService,
  type CurrencyStatsChange,
  type HoldingStats,
  type Lot,
} from '../positionsService/index.js';
import { getInstrumentInfos, type InstrumentInfo } from '../getInstrumentInfos/index.js';

export { gatherStatsObjects, type StatsObjects, type StatsObjectsArray };

async function gatherStatsObjects(params: {
  portfolioStats: { portfolioOwnerId: string; statsCurrency?: string | null | undefined }[];
  holdingStats: { holdingPortfolioOwnerId: string; holdingSymbol?: string }[];
  lots: { lotId: string }[];
  discardOverlapping?: boolean;
}): Promise<StatsObjectsArray> {
  const [portfolioStats, holdingStats, lots] = await Promise.all([
    gatherPortfolioStats(params.portfolioStats),
    gatherHoldingStats(params.holdingStats),
    gatherLots(params.lots),
  ]);

  const symbolInfos = await getInstrumentInfos({
    symbols: [...holdingStats.map(({ symbol }) => symbol), ...lots.map(({ symbol }) => symbol)],
  });

  const [holdingStatsWithSymInfos, lotsWithSymInfos] = [
    holdingStats.map(h => ({ ...h, symbolInfo: symbolInfos[h.symbol] })),
    lots.map(p => ({ ...p, symbolInfo: symbolInfos[p.symbol] })),
  ];

  const result = (() => {
    if (!params.discardOverlapping) {
      return [portfolioStats, holdingStatsWithSymInfos, lotsWithSymInfos] as const;
    }

    const holdingsNonOverlapping = holdingStatsWithSymInfos.filter(
      h =>
        !portfolioStats.some(
          ps => ps.ownerId === h.ownerId && ps.forCurrency === h.symbolInfo.currency
        )
    );
    const lotsNonOverlapping = lotsWithSymInfos.filter(
      lot =>
        !holdingsNonOverlapping.some(h => h.ownerId === lot.ownerId && h.symbol === lot.symbol) &&
        !portfolioStats.some(
          p => p.ownerId === lot.ownerId && p.forCurrency === lot.symbolInfo.currency
        )
    );

    return [portfolioStats, holdingsNonOverlapping, lotsNonOverlapping] as const;
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
): Promise<CurrencyStatsChange<true, false>[]> {
  return !portfolioStatsSpecifiers.length
    ? []
    : await positionsService.retrieveCurrencyStatsChanges({
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

async function gatherLots(
  lotSpecifiers: {
    lotId: string;
  }[]
): Promise<Lot[]> {
  const lots = !lotSpecifiers.length
    ? []
    : await positionsService.retrieveLots({
        filters: {
          ids: lotSpecifiers.map(({ lotId }) => lotId),
        },
      });

  if (lots.length < lotSpecifiers.length) {
    const lotIdsGiven = lotSpecifiers.map(({ lotId }) => lotId);
    const unmatchedLotsIds = differenceWith(
      lotIdsGiven,
      lots,
      (askedLotId, lot) => askedLotId === lot.id
    );
    throw new CustomError({
      type: 'INVALID_LOT_IDS',
      message:
        `Some of the requested lots could not be found (${unmatchedLotsIds.length} in total):\n${unmatchedLotsIds.map(id => `ID "${id}"`).join(',\n')}` as const,
      details: {
        lotIdsGiven,
        unmatchedLotsIds,
      },
    } as const);
  }

  return lots;
}

type StatsObjectsArray = readonly [
  portfolioStats: StatsObjects['portfolioStatsChanges'][string][],
  holdingStats: StatsObjects['holdingStatsChanges'][string][],
  lots: StatsObjects['lotChanges'][string][],
];

type StatsObjects = {
  portfolioStatsChanges: {
    [ownerAndCurrency: string]: CurrencyStatsChange<true, false> & {
      resolvedHoldings: (HoldingStats & {
        symbolInfo: InstrumentInfo;
      })[];
    };
  };
  holdingStatsChanges: {
    [ownerAndSymbol: string]: HoldingStats & { symbolInfo: InstrumentInfo };
  };
  lotChanges: {
    [lotId: string]: Lot & { symbolInfo: InstrumentInfo };
  };
};
