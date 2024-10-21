import { testRedisPublisher } from './testRedisPublisher.js';

export { publishUserHoldingChangedRedisEvent };

async function publishUserHoldingChangedRedisEvent(data: {
  ownerId: string;
  portfolioStats?: { set?: { forCurrency: string }[]; remove?: { forCurrency: string }[] };
  holdingStats?: { set?: string[]; remove?: string[] };
  lots?: { set?: string[]; remove?: string[] };
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
      lots: {
        set: data?.lots?.set ?? [],
        remove: data?.lots?.remove ?? [],
      },
    })
  );
}
