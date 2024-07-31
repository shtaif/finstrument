import { chain } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itFilter, itMap, myIterableCleanupPatcher } from 'iterable-operators';
import { subscriberRedisClient as redisSubscriber } from '../../redisClients.js';
import { userHoldingsChangedTopic } from '../../pubsubTopics/userHoldingsChangedTopic.js';
import {
  retrievePortfolioStatsChanges,
  type PortfolioStatsChange,
} from '../retrievePortfolioStatsChanges/index.js';

export { observePortfolioChanges, type ChangedPortfolio };

function observePortfolioChanges(
  matchers: {
    ownerId: string;
    forCurrency: string | null;
  }[]
): AsyncIterable<PortfolioStatsChange<true, false>[]> {
  if (!matchers.length) {
    return (async function* () {})();
  }

  const matchersByOwnerId = chain(matchers)
    .groupBy(matcher => matcher.ownerId)
    .mapValues(matcherGroup => matcherGroup.map(matcher => matcher.forCurrency))
    .value();

  return pipe(
    userHoldingsChangedTopic.subscribe(redisSubscriber, {
      targetOwnerIds: matchers.map(({ ownerId }) => ownerId),
    }),
    itMap(nextChange =>
      nextChange.portfolioStats.set
        .map(({ forCurrency }) => ({
          ownerId: nextChange.ownerId,
          forCurrency,
        }))
        .filter(({ forCurrency }) => !!matchersByOwnerId[nextChange.ownerId]?.includes(forCurrency))
    ),
    itFilter(portfolioStatsChangedFiltered => !!portfolioStatsChangedFiltered.length),
    myIterableCleanupPatcher(async function* (source) {
      const changesIterator = source[Symbol.asyncIterator]();

      try {
        const firstChangePromise = changesIterator.next();

        yield matchers;

        const next = await firstChangePromise;

        if (next.done) {
          return;
        }

        const nextChanges = next.value;

        yield nextChanges;

        yield* { [Symbol.asyncIterator]: () => changesIterator };
      } finally {
        await changesIterator.return!(undefined);
      }
    }),
    itMap(changedMatchers =>
      retrievePortfolioStatsChanges({
        filters: {
          or: changedMatchers.map(({ ownerId, forCurrency }) => ({
            ownerIds: [ownerId],
            forCurrencies: [forCurrency],
          })),
        },
        latestPerOwner: true,
      })
    )
  );
}

type ChangedPortfolio = PortfolioStatsChange<true, false>;

// (async () => {
//   const iterable = observePortfolioChanges([
//     {
//       ownerId: 'c57066e8-694e-4a33-bd5b-f1d228033402',
//       forCurrency: 'USD',
//     },
//   ]);

//   for await (const updates of iterable) {
//     console.log('UPDATES', updates);
//   }
// })();
