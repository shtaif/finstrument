import { assign, keyBy } from 'lodash-es';
import { empty, of } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import { itMap, itMerge, itLazyDefer, itShare } from 'iterable-operators';
import { gatherStatsObjects, type StatsObjects } from './gatherStatsObjects.js';
import { watchStatsObjectChangesPerSpecifiers } from './watchStatsObjectChangesPerSpecifiers.js';

export {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type PositionObjectSpecifier,
  type HoldingObjectSpecifier,
  type PortfolioObjectSpecifier,
  type StatsObjects,
  type StatsObjectChanges2,
};

function observeStatsObjectChanges(params: {
  specifiers: StatsObjectSpecifier[];
  discardOverlapping?: boolean;
}): AsyncIterable<StatsObjectChanges2> {
  const paramsNorm = {
    specifiers: params.specifiers,
    discardOverlapping: !!params.discardOverlapping,
  };

  if (!paramsNorm.specifiers.length) {
    return empty();
  }

  const specifiersByType = {
    position: paramsNorm.specifiers.filter((s): s is PositionObjectSpecifier => {
      return s.type === 'POSITION';
    }),
    holding: paramsNorm.specifiers.filter((s): s is HoldingObjectSpecifier => {
      return s.type === 'HOLDING';
    }),
    portfolio: paramsNorm.specifiers.filter((s): s is PortfolioObjectSpecifier => {
      return s.type === 'PORTFOLIO';
    }),
  };

  return pipe(
    itLazyDefer(async () => {
      const [allCurrPortfolioStats, allCurrHoldingStats, allCurrPositions] = [
        Object.create(null),
        Object.create(null),
        Object.create(null),
      ] as [
        { [ownerIdAndCurrency: string]: StatsObjects['portfolioStatsChanges'][string] },
        { [ownerIdAndSymbol: string]: StatsObjects['holdingStatsChanges'][string] },
        { [positionId: string]: StatsObjects['positionChanges'][string] },
      ];

      const [requestedPortfolioStats, requestedHoldings, requestedPositions] =
        await gatherStatsObjects({
          portfolioStats: specifiersByType.portfolio,
          holdingStats: specifiersByType.holding,
          positions: specifiersByType.position,
          discardOverlapping: paramsNorm.discardOverlapping,
        });

      return pipe(
        itMerge(
          of({
            portfolioStats: { set: requestedPortfolioStats, remove: [] },
            holdingStats: { set: requestedHoldings, remove: [] },
            positions: { set: requestedPositions, remove: [] },
          }) satisfies AsyncIterable<StatsObjectChangesInner>,

          pipe(
            watchStatsObjectChangesPerSpecifiers({
              portfolio: specifiersByType.portfolio,
              holding: specifiersByType.holding,
              position: requestedPositions.map(p => ({
                positionOwnerId: p.ownerId,
                positionId: p.id,
              })),
            }),
            itMap(async statsObjectSpecs => {
              const [portfolioStatsToSet, holdingStatsToSet, positionsToSet] =
                await gatherStatsObjects({
                  portfolioStats: statsObjectSpecs.portfolioStats.set,
                  holdingStats: statsObjectSpecs.holdingStats.set,
                  positions: statsObjectSpecs.positions.set,
                });

              const [portfolioStatsToRemove, holdingStatsToRemove, positionsToRemove] = [
                statsObjectSpecs.portfolioStats.remove.map(
                  ({ portfolioOwnerId, statsCurrency }) =>
                    allCurrPortfolioStats[`${portfolioOwnerId}_${statsCurrency ?? ''}`]
                ),
                statsObjectSpecs.holdingStats.remove.map(
                  ({ holdingPortfolioOwnerId, holdingSymbol }) =>
                    allCurrHoldingStats[`${holdingPortfolioOwnerId}_${holdingSymbol}`]
                ),
                statsObjectSpecs.positions.remove.map(
                  ({ positionId }) => allCurrPositions[positionId]
                ),
              ];

              return {
                portfolioStats: { set: portfolioStatsToSet, remove: portfolioStatsToRemove },
                holdingStats: { set: holdingStatsToSet, remove: holdingStatsToRemove },
                positions: { set: positionsToSet, remove: positionsToRemove },
              };
            })
          )
        ),
        itMap(changes => {
          for (const { ownerId, forCurrency } of changes.portfolioStats.remove) {
            delete allCurrPortfolioStats[`${ownerId}_${forCurrency ?? ''}`];
          }
          for (const { ownerId, symbol } of changes.holdingStats.remove) {
            delete allCurrHoldingStats[`${ownerId}_${symbol}`];
          }
          for (const { id } of changes.positions.remove) {
            delete allCurrPositions[id];
          }

          assign(
            allCurrPortfolioStats,
            keyBy(changes.portfolioStats.set, p => `${p.ownerId}_${p.forCurrency ?? ''}`)
          );
          assign(
            allCurrHoldingStats,
            keyBy(changes.holdingStats.set, h => `${h.ownerId}_${h.symbol}`)
          );
          assign(
            allCurrPositions,
            keyBy(changes.positions.set, p => `${p.id}`)
          );

          return {
            current: {
              portfolioStats: allCurrPortfolioStats,
              holdingStats: allCurrHoldingStats,
              positions: allCurrPositions,
            },
            changes: {
              portfolioStats: changes.portfolioStats,
              holdingStats: changes.holdingStats,
              positions: changes.positions,
            },
          };
        })
      );
    }),
    itShare()
  );
}

type StatsObjectSpecifier =
  | { type: 'POSITION'; positionId: string }
  | { type: 'HOLDING'; holdingPortfolioOwnerId: string; holdingSymbol?: string | undefined }
  | { type: 'PORTFOLIO'; portfolioOwnerId: string; statsCurrency: string | null | undefined };

type PositionObjectSpecifier = Extract<StatsObjectSpecifier, { type: 'POSITION' }>;
type HoldingObjectSpecifier = Extract<StatsObjectSpecifier, { type: 'HOLDING' }>;
type PortfolioObjectSpecifier = Extract<StatsObjectSpecifier, { type: 'PORTFOLIO' }>;

type StatsObjectChanges2 = {
  readonly current: {
    readonly portfolioStats: {
      [ownerIdAndCurrency: string]: StatsObjects['portfolioStatsChanges'][string];
    };
    readonly holdingStats: {
      [ownerIdAndSymbol: string]: StatsObjects['holdingStatsChanges'][string];
    };
    readonly positions: {
      [positionId: string]: StatsObjects['positionChanges'][string];
    };
  };
  readonly changes: {
    readonly portfolioStats: {
      set: StatsObjects['portfolioStatsChanges'][string][];
      remove: StatsObjects['portfolioStatsChanges'][string][];
    };
    readonly holdingStats: {
      set: StatsObjects['holdingStatsChanges'][string][];
      remove: StatsObjects['holdingStatsChanges'][string][];
    };
    readonly positions: {
      set: StatsObjects['positionChanges'][string][];
      remove: StatsObjects['positionChanges'][string][];
    };
  };
};

type StatsObjectChangesInner = StatsObjectChanges2['changes'];
