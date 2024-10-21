import { intersectionWith } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itMap } from 'iterable-operators';
import { subscriberRedisClient as redisSubscriber } from '../redisClients.js';
import { userHoldingsChangedTopic } from '../pubsubTopics/userHoldingsChangedTopic.js';

export { watchStatsObjectChangesPerSpecifiers, type StatsObjectChangeSpecs };

function watchStatsObjectChangesPerSpecifiers(specifiers: {
  lot: {
    lotOwnerId: string;
    lotId: string;
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
    ...specifiers.lot.map(p => p.lotOwnerId),
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

      const [lotsToSetSpecs, lotsToRemoveSpecs] = [event.lots.set, event.lots.remove].map(lots =>
        pipe(
          lots,
          v =>
            intersectionWith(
              v,
              specifiers.lot,
              (lotIdChanged, lotSpecified) => lotIdChanged === lotSpecified.lotId
            ),
          v => v.map(lotId => ({ lotId }))
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
        lots: {
          set: lotsToSetSpecs,
          remove: lotsToRemoveSpecs,
        },
      };
    })
    // itFilter(
    //   ([portfolioStatsChanges, holdingStatsChanges, lotChanges]) =>
    //     !!portfolioStatsChanges.length || !!holdingStatsChanges.length || !!lotChanges.length
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
  readonly lots: {
    set: { lotId: string }[];
    remove: { lotId: string }[];
  };
};
