import { testRedisPublisher } from './testRedisPublisher.js';

export { publishUserHoldingChangedRedisEvent };

async function publishUserHoldingChangedRedisEvent(data: {
  ownerId: string;
  portfolioStats?: { set?: { forCurrency: string }[]; remove?: { forCurrency: string }[] };
  holdingStats?: { set?: string[]; remove?: string[] };
  positions?: { set?: string[]; remove?: string[] };
}): Promise<void> {
  await testRedisPublisher.publish(
    `user-holdings-changed:${data.ownerId}`,
    JSON.stringify({
      ownerId: data.ownerId,
      portfolioStats: {
        set: data?.portfolioStats?.set ?? [],
        remove: data?.portfolioStats?.remove ?? [],
      },
      holdingStats: {
        set: data?.holdingStats?.set ?? [],
        remove: data?.holdingStats?.remove ?? [],
      },
      positions: {
        set: data?.positions?.set ?? [],
        remove: data?.positions?.remove ?? [],
      },
    })
  );
}
