import { groupBy, mapValues } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itFilter, itMap, myIterableCleanupPatcher } from 'iterable-operators';
import { subscriberRedisClient as redisSubscriber } from '../../redisClients.js';
import { userHoldingsChangedTopic } from '../../pubsubTopics/userHoldingsChangedTopic.js';
import { retrieveHoldingStats, type HoldingStats } from '../retrieveHoldingStats/index.js';

export { observeHoldingChanges, type HoldingStats };

// function observeHoldingChanges(
//   matchers: (
//     | { type: 'PORTFOLIO'; ownerId: string }
//     | { type: 'PORTFOLIO_HOLDINGS'; ownerId: string }
//     | { type: 'HOLDING'; ownerId: string; symbol: string }
//   )[]
// ): AsyncIterable<HoldingStats[]> {
//   return pipe(
//     subscribeUserHoldingsChangedEvents(matchers.map(({ ownerId }) => ownerId).filter(Boolean)),
//     myIterableCleanupPatcher(async function* (changeEvents) {
//       const changeEventsIterator = changeEvents[Symbol.asyncIterator]();

//       const firstChangePromise = changeEventsIterator.next();

//       yield matchers;

//       const next = await firstChangePromise;

//       if (next.done) {
//         return;
//       }

//       const changedHoldings = next.value;

//       yield matchers.filter(matcher => {
//         return changedHoldings.some(
//           matcher.type === 'PORTFOLIO' || matcher.type === 'PORTFOLIO_HOLDINGS'
//             ? changedHolding => changedHolding.ownerId === matcher.ownerId
//             : changedHolding =>
//                 changedHolding.ownerId === matcher.ownerId &&
//                 changedHolding.symbol === matcher.symbol
//         );
//       });

//       for await (const changedHoldings of { [Symbol.asyncIterator]: () => changeEventsIterator }) {
//         yield matchers.filter(matcher => {
//           return changedHoldings.some(
//             matcher.type === 'PORTFOLIO' || matcher.type === 'PORTFOLIO_HOLDINGS'
//               ? changedHolding => changedHolding.ownerId === matcher.ownerId
//               : changedHolding =>
//                   changedHolding.ownerId === matcher.ownerId &&
//                   changedHolding.symbol === matcher.symbol
//           );
//         });
//       }
//     }),
//     asyncIterMap(changedHoldings =>
//       changedHoldings.filter(holding =>
//         matchers.some(
//           param =>
//             param.ownerId === holding.ownerId &&
//             (!param.symbols?.length || param.symbols.includes(holding.symbol))
//         )
//       )
//     ),
//     asyncIterFilter(relevantChangedHoldings => !relevantChangedHoldings.length),
//     myIterableCleanupPatcher(async function* (source) {
//       const holdingChangesIterator = source[Symbol.asyncIterator]();

//       try {
//         const firstChangePromise = holdingChangesIterator.next();

//         yield await retrieveHoldingStats({
//           filters: {
//             or: matchers.map(param => ({
//               ownerIds: [param.ownerId],
//               symbols: param.symbols,
//             })),
//           },
//         });

//         const next = await firstChangePromise;

//         if (next.done) {
//           return;
//         }

//         const releventChangedHoldings = next.value;

//         yield await retrieveHoldingStats({
//           filters: {
//             or: releventChangedHoldings.map(({ ownerId, symbol }) => ({
//               ownerIds: [ownerId],
//               symbols: [symbol],
//             })),
//           },
//         });

//         for await (const releventChangedHoldings of {
//           [Symbol.asyncIterator]: () => holdingChangesIterator,
//         }) {
//           yield await retrieveHoldingStats({
//             filters: {
//               or: releventChangedHoldings.map(({ ownerId, symbol }) => ({
//                 ownerIds: [ownerId],
//                 symbols: [symbol],
//               })),
//             },
//           });
//         }
//       } finally {
//         await holdingChangesIterator.return!(undefined);
//       }
//     })
//   );
// }

function observeHoldingChanges(
  matchers: {
    ownerId: string;
    symbols?: string[];
  }[]
): AsyncIterable<HoldingStats[]> {
  if (!matchers.length) {
    return (async function* () {})();
  }

  const matchersByOwnerId = pipe(
    matchers,
    v => groupBy(v, matcher => matcher.ownerId),
    v =>
      mapValues(v, matcherGroup => ({
        symbols: matcherGroup.flatMap(({ symbols }) => symbols ?? []),
      }))
  );

  return pipe(
    userHoldingsChangedTopic.subscribe(redisSubscriber, {
      targetOwnerIds: matchers.map(({ ownerId }) => ownerId),
    }),
    itMap(nextChange => {
      const changedHoldingRefs = nextChange.holdingStats.set.map(symbol => ({
        ownerId: nextChange.ownerId,
        symbol,
      }));
      return changedHoldingRefs.filter(({ symbol }) => {
        const symbols = matchersByOwnerId[nextChange.ownerId]?.symbols;
        return !symbols.length || symbols.includes(symbol);
      });
    }),
    itFilter(relevantChangedHoldings => !!relevantChangedHoldings.length),
    myIterableCleanupPatcher(async function* (source) {
      const holdingChangesIterator = source[Symbol.asyncIterator]();

      try {
        const firstChangePromise = holdingChangesIterator.next();

        yield await retrieveHoldingStats({
          filters: {
            or: matchers.map(param => ({
              ownerIds: [param.ownerId],
              symbols: param.symbols,
            })),
          },
        });

        const next = await firstChangePromise;

        if (next.done) {
          return;
        }

        const releventChangedHoldings = next.value;

        yield await retrieveHoldingStats({
          filters: {
            or: releventChangedHoldings.map(({ ownerId, symbol }) => ({
              ownerIds: [ownerId],
              symbols: [symbol],
            })),
          },
        });

        for await (const releventChangedHoldings of {
          [Symbol.asyncIterator]: () => holdingChangesIterator,
        }) {
          yield await retrieveHoldingStats({
            filters: {
              or: releventChangedHoldings.map(({ ownerId, symbol }) => ({
                ownerIds: [ownerId],
                symbols: [symbol],
              })),
            },
          });
        }
      } finally {
        await holdingChangesIterator.return!(undefined);
      }
    })
  );
}
