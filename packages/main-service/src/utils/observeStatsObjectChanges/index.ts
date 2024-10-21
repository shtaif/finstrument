import { assign, keyBy } from 'lodash-es';
import { empty, of } from '@reactivex/ix-esnext-esm/asynciterable';
import { pipe } from 'shared-utils';
import { itMap, itMerge, itLazyDefer, itShare } from 'iterable-operators';
import { gatherStatsObjects, type StatsObjects } from './gatherStatsObjects.js';
import { watchStatsObjectChangesPerSpecifiers } from './watchStatsObjectChangesPerSpecifiers.js';

export {
  observeStatsObjectChanges,
  type StatsObjectSpecifier,
  type LotObjectSpecifier,
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
    lot: paramsNorm.specifiers.filter((s): s is LotObjectSpecifier => {
      return s.type === 'LOT';
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
      const [allCurrPortfolioStats, allCurrHoldingStats, allCurrLots] = [
        Object.create(null),
        Object.create(null),
        Object.create(null),
      ] as [
        { [ownerIdAndCurrency: string]: StatsObjects['portfolioStatsChanges'][string] },
        { [ownerIdAndSymbol: string]: StatsObjects['holdingStatsChanges'][string] },
        { [lotId: string]: StatsObjects['lotChanges'][string] },
      ];

      const [requestedPortfolioStats, requestedHoldings, requestedLots] = await gatherStatsObjects({
        portfolioStats: specifiersByType.portfolio,
        holdingStats: specifiersByType.holding,
        lots: specifiersByType.lot,
        discardOverlapping: paramsNorm.discardOverlapping,
      });

      return pipe(
        itMerge(
          of({
            portfolioStats: { set: requestedPortfolioStats, remove: [] },
            holdingStats: { set: requestedHoldings, remove: [] },
            lots: { set: requestedLots, remove: [] },
          }) satisfies AsyncIterable<StatsObjectChangesInner>,

          pipe(
            watchStatsObjectChangesPerSpecifiers({
              portfolio: specifiersByType.portfolio,
              holding: specifiersByType.holding,
              lot: requestedLots.map(p => ({
                lotOwnerId: p.ownerId,
                lotId: p.id,
              })),
            }),
            itMap(async statsObjectSpecs => {
              const [portfolioStatsToSet, holdingStatsToSet, lotsToSet] = await gatherStatsObjects({
                portfolioStats: statsObjectSpecs.portfolioStats.set,
                holdingStats: statsObjectSpecs.holdingStats.set,
                lots: statsObjectSpecs.lots.set,
              });

              const [portfolioStatsToRemove, holdingStatsToRemove, lotsToRemove] = [
                statsObjectSpecs.portfolioStats.remove.map(
                  ({ portfolioOwnerId, statsCurrency }) =>
                    allCurrPortfolioStats[`${portfolioOwnerId}_${statsCurrency ?? ''}`]
                ),
                statsObjectSpecs.holdingStats.remove.map(
                  ({ holdingPortfolioOwnerId, holdingSymbol }) =>
                    allCurrHoldingStats[`${holdingPortfolioOwnerId}_${holdingSymbol}`]
                ),
                statsObjectSpecs.lots.remove.map(({ lotId }) => allCurrLots[lotId]),
              ];

              return {
                portfolioStats: { set: portfolioStatsToSet, remove: portfolioStatsToRemove },
                holdingStats: { set: holdingStatsToSet, remove: holdingStatsToRemove },
                lots: { set: lotsToSet, remove: lotsToRemove },
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
          for (const { id } of changes.lots.remove) {
            delete allCurrLots[id];
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
            allCurrLots,
            keyBy(changes.lots.set, p => `${p.id}`)
          );

          return {
            current: {
              portfolioStats: allCurrPortfolioStats,
              holdingStats: allCurrHoldingStats,
              lots: allCurrLots,
            },
            changes: {
              portfolioStats: changes.portfolioStats,
              holdingStats: changes.holdingStats,
              lots: changes.lots,
            },
          };
        })
      );
    }),
    itShare()
  );
}

type StatsObjectSpecifier =
  | { type: 'LOT'; lotId: string }
  | { type: 'HOLDING'; holdingPortfolioOwnerId: string; holdingSymbol?: string | undefined }
  | { type: 'PORTFOLIO'; portfolioOwnerId: string; statsCurrency: string | null | undefined };

type LotObjectSpecifier = Extract<StatsObjectSpecifier, { type: 'LOT' }>;
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
    readonly lots: {
      [lotId: string]: StatsObjects['lotChanges'][string];
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
    readonly lots: {
      set: StatsObjects['lotChanges'][string][];
      remove: StatsObjects['lotChanges'][string][];
    };
  };
};

type StatsObjectChangesInner = StatsObjectChanges2['changes'];
