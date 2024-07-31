import { intersectionWith } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { subscriberRedisClient as redisSubscriber } from '../redisClients.js';
import { userHoldingsChangedTopic } from '../pubsubTopics/userHoldingsChangedTopic.js';

export { watchStatsObjectChangesPerSpecifiers, type StatsObjectChangeSpecs };

function watchStatsObjectChangesPerSpecifiers(specifiers: {
  position: {
    positionOwnerId: string;
    positionId: string;
  }[];
  holding: {
    holdingPortfolioOwnerId: string;
    holdingSymbol?: string | undefined;
  }[];
  portfolio: {
    portfolioOwnerId: string;
    statsCurrency?: string | null | undefined;
  }[];
}): AsyncIterable<StatsObjectChangeSpecs> {
  const targetOwnerIdsToSubscribeFor = [
    ...specifiers.portfolio.map(p => p.portfolioOwnerId),
    ...specifiers.holding.map(h => h.holdingPortfolioOwnerId),
    ...specifiers.position.map(p => p.positionOwnerId),
  ];

  return pipe(
    userHoldingsChangedTopic.subscribe(redisSubscriber, {
      targetOwnerIds: targetOwnerIdsToSubscribeFor,
    }),
    itMap(async event => {
      const [portfolioStatsToSetSpecs, portfolioStatsToRemoveSpecs] = [
        event.portfolioStats.set,
        event.portfolioStats.remove,
      ].map(pStatsSpecs =>
        pStatsSpecs
          .filter(pChanged => {
            const matchesGivenSpecifiers = specifiers.portfolio.some(
              pSpecified =>
                event.ownerId === pSpecified.portfolioOwnerId &&
                [undefined, pChanged.forCurrency].includes(pSpecified.statsCurrency)
            );
            return matchesGivenSpecifiers;
          })
          .map(({ forCurrency }) => ({
            portfolioOwnerId: event.ownerId,
            statsCurrency: forCurrency,
          }))
      );

      const [holdingStatsToSetSpecs, holdingStatsToRemoveSpecs] = [
        event.holdingStats.set,
        event.holdingStats.remove,
      ].map(holdingStats =>
        holdingStats
          .filter(symbol =>
            specifiers.holding.some(
              ({ holdingPortfolioOwnerId, holdingSymbol }) =>
                holdingPortfolioOwnerId === event.ownerId &&
                [undefined, symbol].includes(holdingSymbol)
            )
          )
          .map(symbol => ({
            holdingPortfolioOwnerId: event.ownerId,
            holdingSymbol: symbol,
          }))
      );

      const [positionsToSetSpecs, positionsToRemoveSpecs] = [
        event.positions.set,
        event.positions.remove,
      ].map(positions =>
        pipe(
          positions,
          v =>
            intersectionWith(
              v,
              specifiers.position,
              (posIdChanged, posSpecified) => posIdChanged === posSpecified.positionId
            ),
          v => v.map(positionId => ({ positionId }))
        )
      );

      return {
        portfolioStats: {
          set: portfolioStatsToSetSpecs,
          remove: portfolioStatsToRemoveSpecs,
        },
        holdingStats: {
          set: holdingStatsToSetSpecs,
          remove: holdingStatsToRemoveSpecs,
        },
        positions: {
          set: positionsToSetSpecs,
          remove: positionsToRemoveSpecs,
        },
      };
    })
    // itFilter(
    //   ([portfolioStatsChanges, holdingStatsChanges, positionChanges]) =>
    //     !!portfolioStatsChanges.length || !!holdingStatsChanges.length || !!positionChanges.length
    // )
  );
}

type StatsObjectChangeSpecs = {
  readonly portfolioStats: {
    set: { portfolioOwnerId: string; statsCurrency: string | null }[];
    remove: { portfolioOwnerId: string; statsCurrency: string | null }[];
  };
  readonly holdingStats: {
    set: { holdingPortfolioOwnerId: string; holdingSymbol: string }[];
    remove: { holdingPortfolioOwnerId: string; holdingSymbol: string }[];
  };
  readonly positions: {
    set: { positionId: string }[];
    remove: { positionId: string }[];
  };
};
