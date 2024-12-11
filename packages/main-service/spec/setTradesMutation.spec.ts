import { afterAll, beforeEach, beforeAll, it, expect, describe } from 'vitest';
import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import {
  PositionChangeModel,
  InstrumentInfoModel,
  CurrencyStatsChangeModel,
  LotModel,
  TradeRecordModel,
  UserModel,
} from '../src/db/index.js';
import { mockGqlContext, unmockGqlContext } from './utils/mockGqlContext.js';
import { axiosGqlClient } from './utils/axiosGqlClient.js';
import { userHoldingsChangedTopic } from '../src/utils/pubsubTopics/userHoldingsChangedTopic.js';
import { mockUuidFromNumber } from './utils/mockUuidFromNumber.js';
import { testRedisSubscriber } from './utils/testRedisSubscriber.js';

const [mockUserId1, mockUserId2] = [mockUuidFromNumber(1), mockUuidFromNumber(2)];

const [mockUser1, mockUser2] = [
  { id: mockUserId1, alias: mockUserId1 },
  { id: mockUserId2, alias: mockUserId2 },
];

beforeAll(async () => {
  await Promise.all([
    UserModel.bulkCreate([mockUser1, mockUser2]),
    InstrumentInfoModel.bulkCreate([
      {
        symbol: 'ADBE',
        name: 'Adobe Inc',
        exchangeMic: 'aaa',
        currency: 'USD',
      },
      {
        symbol: 'AAPL',
        name: 'Apple Inc',
        exchangeMic: 'bbb',
        currency: 'USD',
      },
      {
        symbol: 'NVDA',
        name: 'Nvidia Inc',
        exchangeMic: 'ccc',
        currency: 'USD',
      },
      {
        symbol: 'VUAG',
        name: 'Vanguard S&P 500 UCITS ETF USD Acc',
        exchangeMic: 'ddd',
        currency: 'GBP',
      },
      {
        symbol: 'BTC-USD',
        name: 'Bitcoin USD',
        exchangeMic: 'eee',
        currency: 'USD',
      },
    ]),
  ]);

  mockGqlContext(ctx => ({
    ...ctx,
    getSession: () => ({ activeUserId: mockUserId1 }),
  }));
});

beforeEach(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await Promise.all([
    PositionChangeModel.destroy({ where: {} }),
    CurrencyStatsChangeModel.destroy({ where: {} }),
    LotModel.destroy({ where: {} }),
  ]);
});

afterAll(async () => {
  await TradeRecordModel.destroy({ where: {} });
  await LotModel.destroy({ where: {} });
  await PositionChangeModel.destroy({ where: {} });
  await CurrencyStatsChangeModel.destroy({ where: {} });
  await InstrumentInfoModel.destroy({ where: {} });
  await UserModel.destroy({ where: {} });
  unmockGqlContext();
});

describe('Mutation.setTrades', () => {
  it('Importing an empty trade dataset onto an empty portfolio', async () => {
    const emptyTradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv: emptyTradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: MERGE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 0,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [redisEvent, lotsCreated, holdingStatsChangesCreated, portfolioStatsChangesCreated] =
      await Promise.all([
        redisEventPromise,
        (async () => (await LotModel.findAll()).map(r => r.dataValues))(),
        (async () => (await PositionChangeModel.findAll()).map(r => r.dataValues))(),
        (async () => (await CurrencyStatsChangeModel.findAll()).map(r => r.dataValues))(),
      ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: { set: [], remove: [] },
      holdingStats: { set: [], remove: [] },
      lots: { set: [], remove: [] },
    });
    expect(lotsCreated).toStrictEqual([]);
    expect(holdingStatsChangesCreated).toStrictEqual([]);
    expect(portfolioStatsChangesCreated).toStrictEqual([]);
  });

  it('Importing a trade dataset into an empty portfolio', async () => {
    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-03, 00:00:00",2,1.3
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: MERGE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 3,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      tradesCreated,
      lotsCreated,
      holdingStatsChangesCreated,
      portfolioStatsChangesCreated,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [lotsCreated[0].id, lotsCreated[1].id, lotsCreated[2].id],
        remove: [],
      },
    });

    expect(tradesCreated).toStrictEqual([
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        symbol: 'ADBE',
        performedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.1,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        symbol: 'ADBE',
        performedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        symbol: 'AAPL',
        performedAt: new Date('2024-01-03, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.3,
      },
    ]);

    expect(lotsCreated).toStrictEqual([
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'AAPL',
        openedAt: new Date('2024-01-03, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
    ]);

    expect(holdingStatsChangesCreated).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'AAPL',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);

    expect(portfolioStatsChangesCreated).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalPresentInvestedAmount: 7.199999999999999,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);
  });

  it(
    "Importing a trade dataset missing previously existing trades via `mode: 'REPLACE'` will cause " +
      'their removal once processed',
    async () => {
      const initialTrades = (
        await TradeRecordModel.bulkCreate([
          {
            id: mockUuidFromNumber(0),
            ownerId: mockUserId1,
            symbol: 'ADBE',
            performedAt: new Date('2024-01-01, 00:00:00'),
            quantity: 2,
            price: 1.1,
          },
          {
            id: mockUuidFromNumber(1),
            ownerId: mockUserId1,
            symbol: 'AAPL',
            performedAt: new Date('2024-01-02, 00:00:00'),
            quantity: 2,
            price: 1.2,
          },
          {
            id: mockUuidFromNumber(2),
            ownerId: mockUserId1,
            symbol: 'NVDA',
            performedAt: new Date('2024-01-03, 00:00:00'),
            quantity: 2,
            price: 1.3,
          },
        ])
      ).map(record => record.dataValues);

      const initialLots = (
        await LotModel.bulkCreate([
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[0].id,
            symbol: 'ADBE',
            openedAt: new Date('2024-01-01, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[1].id,
            symbol: 'AAPL',
            openedAt: new Date('2024-01-02, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[2].id,
            symbol: 'NVDA',
            openedAt: new Date('2024-01-03, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
        ])
      ).map(record => record.dataValues);

      const initialHoldingStats = (
        await PositionChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[0].id,
            symbol: 'ADBE',
            changedAt: new Date('2024-01-01, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.2,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[1].id,
            symbol: 'AAPL',
            changedAt: new Date('2024-01-02, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.4,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[2].id,
            symbol: 'NVDA',
            changedAt: new Date('2024-01-03, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.6,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
        ])
      ).map(record => record.dataValues);

      const initialPortfolioStats = (
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[0].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-01, 00:00:00'),
            totalPresentInvestedAmount: 2.2,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[1].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-02, 00:00:00'),
            totalPresentInvestedAmount: 4.6,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[2].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-03, 00:00:00'),
            totalPresentInvestedAmount: 7.199999999999999,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
        ])
      ).map(record => record.dataValues);

      const tradesCsv = `
        Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
        Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      `.trim();

      const redisEventPromise = pipe(
        userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
          targetOwnerIds: [mockUserId1],
        }),
        itTakeFirst()
      );

      const resp = await axiosGqlClient({
        data: {
          variables: { tradesCsv },
          query: /* GraphQL */ `
            mutation ($tradesCsv: String!) {
              setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
                tradesAddedCount
                tradesModifiedCount
                tradesRemovedCount
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          setTrades: {
            tradesAddedCount: 0,
            tradesModifiedCount: 0,
            tradesRemovedCount: 2,
          },
        },
      });

      const [
        redisEvent,
        allFinalTrades,
        allFinalLots,
        allFinalHoldingStatsChanges,
        allFinalPortfolioStatsChanges,
      ] = await Promise.all([
        redisEventPromise,
        TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
      ]);

      expect(redisEvent).toStrictEqual({
        ownerId: mockUserId1,
        portfolioStats: {
          set: [{ forCurrency: 'USD' }],
          remove: [],
        },
        holdingStats: {
          set: [],
          remove: ['AAPL', 'ADBE'],
        },
        lots: {
          set: [],
          remove: [initialLots[0].id, initialLots[1].id],
        },
      });

      expect(allFinalTrades).toStrictEqual([initialTrades[2]]);
      expect(allFinalLots).toStrictEqual([initialLots[2]]);
      expect(allFinalHoldingStatsChanges).toStrictEqual([initialHoldingStats[2]]);
      expect(allFinalPortfolioStatsChanges).toStrictEqual([
        {
          ...initialPortfolioStats[2],
          totalPresentInvestedAmount: 2.6,
        },
      ]);
    }
  );

  it(
    "Importing a trade dataset missing some existing trades via `mode: 'MERGE'` will preserve " +
      'the existing originals once processed',
    async () => {
      const initialTrades = (
        await TradeRecordModel.bulkCreate([
          {
            id: mockUuidFromNumber(0),
            ownerId: mockUserId1,
            symbol: 'ADBE',
            performedAt: new Date('2024-01-01, 00:00:00'),
            quantity: 2,
            price: 1.1,
          },
          {
            id: mockUuidFromNumber(1),
            ownerId: mockUserId1,
            symbol: 'AAPL',
            performedAt: new Date('2024-01-02, 00:00:00'),
            quantity: 2,
            price: 1.2,
          },
          {
            id: mockUuidFromNumber(2),
            ownerId: mockUserId1,
            symbol: 'NVDA',
            performedAt: new Date('2024-01-03, 00:00:00'),
            quantity: 2,
            price: 1.3,
          },
        ])
      ).map(record => record.dataValues);

      const initialLots = (
        await LotModel.bulkCreate([
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[0].id,
            symbol: 'ADBE',
            openedAt: new Date('2024-01-01, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[1].id,
            symbol: 'AAPL',
            openedAt: new Date('2024-01-02, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
          {
            ownerId: mockUserId1,
            openingTradeId: initialTrades[2].id,
            symbol: 'NVDA',
            openedAt: new Date('2024-01-03, 00:00:00'),
            realizedProfitOrLoss: 0,
            remainingQuantity: 2,
          },
        ])
      ).map(record => record.dataValues);

      const initialHoldingStats = (
        await PositionChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[0].id,
            symbol: 'ADBE',
            changedAt: new Date('2024-01-01, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.2,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[1].id,
            symbol: 'AAPL',
            changedAt: new Date('2024-01-02, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.4,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[2].id,
            symbol: 'NVDA',
            changedAt: new Date('2024-01-03, 00:00:00'),
            totalLotCount: 1,
            totalQuantity: 2,
            totalPresentInvestedAmount: 2.6,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
        ])
      ).map(record => record.dataValues);

      const initialPortfolioStats = (
        await CurrencyStatsChangeModel.bulkCreate([
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[0].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-01, 00:00:00'),
            totalPresentInvestedAmount: 2.2,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[1].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-02, 00:00:00'),
            totalPresentInvestedAmount: 4.6,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
          {
            ownerId: mockUserId1,
            relatedTradeId: initialTrades[2].id,
            forCurrency: 'USD',
            changedAt: new Date('2024-01-03, 00:00:00'),
            totalPresentInvestedAmount: 7.199999999999999,
            totalRealizedAmount: 0,
            totalRealizedProfitOrLossAmount: 0,
            totalRealizedProfitOrLossRate: 0,
          },
        ])
      ).map(record => record.dataValues);

      const tradesCsv = `
        Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
        Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      `.trim();

      const redisEventPromise = pipe(
        userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
          targetOwnerIds: [mockUserId1],
        }),
        itTakeFirst()
      );

      const resp = await axiosGqlClient({
        data: {
          variables: { tradesCsv },
          query: /* GraphQL */ `
            mutation ($tradesCsv: String!) {
              setTrades(input: { mode: MERGE, data: { csv: $tradesCsv } }) {
                tradesAddedCount
                tradesModifiedCount
                tradesRemovedCount
              }
            }
          `,
        },
      });

      expect(resp.data).toStrictEqual({
        data: {
          setTrades: {
            tradesAddedCount: 0,
            tradesModifiedCount: 0,
            tradesRemovedCount: 0,
          },
        },
      });

      const [
        redisEvent,
        allFinalTrades,
        allFinalLots,
        allFinalHoldingStatsChanges,
        allFinalPortfolioStatsChanges,
      ] = await Promise.all([
        redisEventPromise,
        TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
        CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
          recs.map(r => r.dataValues)
        ),
      ]);

      expect(redisEvent).toStrictEqual({
        ownerId: mockUserId1,
        portfolioStats: { set: [], remove: [] },
        holdingStats: { set: [], remove: [] },
        lots: { set: [], remove: [] },
      });
      expect(allFinalTrades).toStrictEqual(initialTrades);
      expect(allFinalLots).toStrictEqual(initialLots);
      expect(allFinalHoldingStatsChanges).toStrictEqual(initialHoldingStats);
      expect(allFinalPortfolioStatsChanges).toStrictEqual(initialPortfolioStats);
    }
  );

  it('Importing a trade dataset that adds new trades that occurred before currently stored trades', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
        Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
        Trades,Data,Stocks,VUAG,"2024-01-01, 00:00:00",2,1.1
        Trades,Data,Stocks,VUAG,"2024-01-02, 00:00:00",2,1.2
        Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 2,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: { remove: [], set: [{ forCurrency: 'GBP' }] },
      holdingStats: { remove: [], set: ['VUAG'] },
      lots: { remove: [], set: [allFinalLots[0].id, allFinalLots[1].id] },
    });

    expect(allFinalTrades).toStrictEqual([
      {
        id: allFinalTrades[0].id,
        ownerId: mockUserId1,
        symbol: 'VUAG',
        performedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.1,
      },
      {
        id: allFinalTrades[1].id,
        ownerId: mockUserId1,
        symbol: 'VUAG',
        performedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.2,
      },
      initialTrades[0],
    ]);

    expect(allFinalLots).toStrictEqual([
      {
        id: expect.any(String),
        ownerId: mockUserId1,
        openingTradeId: allFinalTrades[0].id,
        symbol: 'VUAG',
        openedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        id: expect.any(String),
        ownerId: mockUserId1,
        openingTradeId: allFinalTrades[1].id,
        symbol: 'VUAG',
        openedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      initialLots[0],
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[0].id,
        symbol: 'VUAG',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[1].id,
        symbol: 'VUAG',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialHoldingStats[0],
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[0].id,
        forCurrency: 'GBP',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[1].id,
        forCurrency: 'GBP',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialPortfolioStats[0],
    ]);
  });

  it('Importing a trade dataset that has trades with currency-modified symbols', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
        Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
        Trades,Data,Stocks,ADBE:GBP,"2024-01-01, 00:00:00",2,1.1
        Trades,Data,Stocks,AAPL:EUR,"2024-01-02, 00:00:00",2,1.2
        Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 2,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'GBP' }, { forCurrency: 'EUR' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL:EUR', 'ADBE:GBP'],
        remove: [],
      },
      lots: {
        set: [allFinalLots[0].id, allFinalLots[1].id],
        remove: [],
      },
    });

    expect(allFinalTrades).toStrictEqual([
      {
        id: allFinalTrades[0].id,
        ownerId: mockUserId1,
        symbol: 'ADBE:GBP',
        performedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.1,
      },
      {
        id: allFinalTrades[1].id,
        ownerId: mockUserId1,
        symbol: 'AAPL:EUR',
        performedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        quantity: 2,
        price: 1.2,
      },
      initialTrades[0],
    ]);

    expect(allFinalLots).toStrictEqual([
      {
        id: expect.any(String),
        ownerId: mockUserId1,
        openingTradeId: allFinalTrades[0].id,
        symbol: 'ADBE:GBP',
        openedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        id: expect.any(String),
        ownerId: mockUserId1,
        openingTradeId: allFinalTrades[1].id,
        symbol: 'AAPL:EUR',
        openedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      initialLots[0],
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[0].id,
        symbol: 'ADBE:GBP',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[1].id,
        symbol: 'AAPL:EUR',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialHoldingStats[0],
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[0].id,
        forCurrency: 'GBP',
        changedAt: new Date('2024-01-01, 00:00:00'),
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[1].id,
        forCurrency: 'EUR',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalPresentInvestedAmount: 2.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialPortfolioStats[0],
    ]);
  });

  it('Importing a trade dataset that adds lots for previously non-existing holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,NVDA,"2024-01-01, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-03, 00:00:00",2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-04, 00:00:00",2,1.3
      Trades,Data,Stocks,AAPL,"2024-01-05, 00:00:00",2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );
    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 4,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [allFinalLots[1].id, allFinalLots[2].id, allFinalLots[3].id, allFinalLots[4].id],
        remove: [],
      },
    });

    const tradeCommonFieldsToAssert = {
      ownerId: mockUserId1,
      id: expect.any(String),
      recordCreatedAt: expect.any(Date),
      recordUpdatedAt: expect.any(Date),
    };

    expect(allFinalTrades).toStrictEqual([
      initialTrades[0],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-02, 00:00:00'),
        quantity: 2,
        price: 1.1,
      },
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-03, 00:00:00'),
        quantity: 2,
        price: 1.2,
      },
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'AAPL',
        performedAt: new Date('2024-01-04, 00:00:00'),
        quantity: 2,
        price: 1.3,
      },
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'AAPL',
        performedAt: new Date('2024-01-05, 00:00:00'),
        quantity: 2,
        price: 1.4,
      },
    ]);

    expect(allFinalLots).toStrictEqual([
      initialLots[0],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-03, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'AAPL',
        openedAt: new Date('2024-01-04, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'AAPL',
        openedAt: new Date('2024-01-05, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[0],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.2,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'AAPL',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'AAPL',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 5.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      initialPortfolioStats[0],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-02, 00:00:00'),
        totalPresentInvestedAmount: 4.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalPresentInvestedAmount: 6.8,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalPresentInvestedAmount: 9.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalPresentInvestedAmount: 12.200000000000001,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);
  });

  it('Importing a trade dataset that adds lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: 2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-04, 00:00:00'),
          quantity: 2,
          price: 1.4,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-02, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-04, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.4,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.8,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 5,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalPresentInvestedAmount: 7.8,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,NVDA,"2024-01-01, 00:00:00",2,1.3
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.2
      Trades,Data,Stocks,ADBE,"2024-01-03, 00:00:00",2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-04, 00:00:00",2,1.4
      Trades,Data,Stocks,AAPL,"2024-01-05, 00:00:00",2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 2,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [allFinalLots[2].id, allFinalLots[4].id],
        remove: [],
      },
    });

    const tradeCommonFieldsToAssert = {
      ownerId: mockUserId1,
      id: expect.any(String),
      recordCreatedAt: expect.any(Date),
      recordUpdatedAt: expect.any(Date),
    };

    expect(allFinalTrades).toStrictEqual([
      initialTrades[0],
      initialTrades[1],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-03, 00:00:00'),
        quantity: 2,
        price: 1.2,
      },
      initialTrades[2],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'AAPL',
        performedAt: new Date('2024-01-05, 00:00:00'),
        quantity: 2,
        price: 1.4,
      },
    ]);

    expect(allFinalLots).toStrictEqual([
      initialLots[0],
      initialLots[1],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-03, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      initialLots[2],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'AAPL',
        openedAt: new Date('2024-01-05, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[0],
      initialHoldingStats[1],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 4.8,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialHoldingStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'AAPL',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalLotCount: 2,
        totalQuantity: 4,
        totalPresentInvestedAmount: 5.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      initialPortfolioStats[0],
      {
        ...initialPortfolioStats[1],
        totalPresentInvestedAmount: 5,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalPresentInvestedAmount: 7.4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ...initialPortfolioStats[2],
        totalPresentInvestedAmount: 10.2,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalPresentInvestedAmount: 13,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);
  });

  it('Importing a trade dataset that removes some lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: 2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
        {
          id: mockUuidFromNumber(3),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-04, 00:00:00'),
          quantity: 2,
          price: 1.4,
        },
        {
          id: mockUuidFromNumber(4),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-05, 00:00:00'),
          quantity: 2,
          price: 1.5,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-02, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[3].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-04, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[4].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-05, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 2,
          totalQuantity: 4,
          totalPresentInvestedAmount: 4.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalLotCount: 2,
          totalQuantity: 4,
          totalPresentInvestedAmount: 5.4,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[4].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-05, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 3,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 4.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 7.199999999999999,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalPresentInvestedAmount: 10,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[4].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-05, 00:00:00'),
          totalPresentInvestedAmount: 13,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",2,1.1
      Trades,Data,Stocks,AAPL,"2024-01-03, 00:00:00",2,1.3
      Trades,Data,Stocks,NVDA,"2024-01-05, 00:00:00",2,1.5
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 0,
          tradesModifiedCount: 0,
          tradesRemovedCount: 2,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [],
        remove: [initialLots[1].id, initialLots[3].id],
      },
    });

    expect(allFinalTrades).toStrictEqual([initialTrades[0], initialTrades[2], initialTrades[4]]);
    expect(allFinalLots).toStrictEqual([initialLots[0], initialLots[2], initialLots[4]]);
    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[0],
      initialHoldingStats[2],
      initialHoldingStats[4],
    ]);
    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      initialPortfolioStats[0],
      { ...initialPortfolioStats[2], totalPresentInvestedAmount: 4.800000000000001 },
      { ...initialPortfolioStats[4], totalPresentInvestedAmount: 7.800000000000001 },
    ]);
  });

  it('Importing a trade dataset that removes all lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: -2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
        {
          id: mockUuidFromNumber(3),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-04, 00:00:00'),
          quantity: 2,
          price: 1.4,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          remainingQuantity: 0,
          realizedProfitOrLoss: 0.2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-03, 00:00:00'),
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[3].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-04, 00:00:00'),
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 0,
          totalQuantity: 0,
          totalPresentInvestedAmount: 0,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.2,
          totalRealizedProfitOrLossRate: 2.4 / 2.2 - 1,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.8,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 0,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.2,
          totalRealizedProfitOrLossRate: 2.4 / 2.2 - 1,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.2,
          totalRealizedProfitOrLossRate: 2.4 / 2.2 - 1,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalPresentInvestedAmount: 5.4,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.2,
          totalRealizedProfitOrLossRate: 2.4 / 2.2 - 1,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,NVDA,"2024-01-04, 00:00:00",2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 0,
          tradesModifiedCount: 0,
          tradesRemovedCount: 3,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: [],
        remove: ['AAPL', 'ADBE'],
      },
      lots: {
        set: [],
        remove: [initialLots[0].id, initialLots[1].id],
      },
    });

    expect(allFinalTrades).toStrictEqual([initialTrades[3]]);
    expect(allFinalLots).toStrictEqual([initialLots[2]]);
    expect(allFinalHoldingStatsChanges).toStrictEqual([initialHoldingStats[3]]);
    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      {
        ...initialPortfolioStats[3],
        totalPresentInvestedAmount: 2.8,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);
  });

  it('Importing a trade dataset that closes some lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: 2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-02, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 2,
          totalQuantity: 4,
          totalPresentInvestedAmount: 4.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 4.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 7.199999999999999,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.2
      Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      Trades,Data,Stocks,ADBE,"2024-01-04, 00:00:00",-2,1.4
      Trades,Data,Stocks,ADBE,"2024-01-05, 00:00:00",-2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 2,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['ADBE'],
        remove: [],
      },
      lots: {
        set: [initialLots[0].id, initialLots[1].id],
        remove: [],
      },
    });

    const tradeCommonFieldsToAssert = {
      ownerId: mockUserId1,
      id: expect.any(String),
      recordCreatedAt: expect.any(Date),
      recordUpdatedAt: expect.any(Date),
    };

    expect(allFinalTrades).toStrictEqual([
      initialTrades[0],
      initialTrades[1],
      initialTrades[2],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-04, 00:00:00'),
        quantity: -2,
        price: 1.4,
      },
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-05, 00:00:00'),
        quantity: -2,
        price: 1.4,
      },
    ]);

    expect(allFinalLots).toStrictEqual([
      {
        ownerId: mockUserId1,
        id: initialLots[0].id,
        openingTradeId: initialTrades[0].id,
        symbol: 'ADBE',
        openedAt: new Date('2024-01-01, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0.5999999999999996,
        remainingQuantity: 0,
      },
      {
        ownerId: mockUserId1,
        id: initialLots[1].id,
        openingTradeId: initialTrades[1].id,
        symbol: 'ADBE',
        openedAt: new Date('2024-01-02, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0.3999999999999999,
        remainingQuantity: 0,
      },
      initialLots[2],
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[0],
      initialHoldingStats[1],
      initialHoldingStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[3].id,
        symbol: 'ADBE',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.3999999999999995,
        totalRealizedAmount: 2.8,
        totalRealizedProfitOrLossAmount: 0.5999999999999996,
        totalRealizedProfitOrLossRate: 0.2727272727272725,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[4].id,
        symbol: 'ADBE',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalLotCount: 0,
        totalQuantity: 0,
        totalPresentInvestedAmount: -4.440892098500626e-16,
        totalRealizedAmount: 5.6,
        totalRealizedProfitOrLossAmount: 0.9999999999999996,
        totalRealizedProfitOrLossRate: 0.21739130434782616,
      },
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      initialPortfolioStats[0],
      initialPortfolioStats[1],
      initialPortfolioStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[3].id,
        forCurrency: 'USD',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalPresentInvestedAmount: 4.999999999999999,
        totalRealizedAmount: 2.8,
        totalRealizedProfitOrLossAmount: 0.5999999999999996,
        totalRealizedProfitOrLossRate: 0.2727272727272725,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[4].id,
        forCurrency: 'USD',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalPresentInvestedAmount: 2.599999999999999,
        totalRealizedAmount: 5.6,
        totalRealizedProfitOrLossAmount: 0.9999999999999996,
        totalRealizedProfitOrLossRate: 0.21739130434782616,
      },
    ]);
  });

  it('Importing a trade dataset that updates some lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: 2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[1].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-02, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.4,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 4.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 7.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",3,1.15
      Trades,Data,Stocks,AAPL,"2024-01-02, 00:00:00",3,1.25
      Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 0,
          tradesModifiedCount: 2,
          tradesRemovedCount: 0,
        },
      },
    });

    // TODO: Add internal error stack logging to occur for every GraphQL field resolution that threw an error

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [allFinalLots[0].id, allFinalLots[1].id],
        remove: [],
      },
    });

    expect(allFinalTrades).toStrictEqual([
      {
        ...initialTrades[0],
        quantity: 3,
        price: 1.15,
        recordUpdatedAt: expect.any(Date),
      },
      {
        ...initialTrades[1],
        quantity: 3,
        price: 1.25,
        recordUpdatedAt: expect.any(Date),
      },
      initialTrades[2],
    ]);

    expect(allFinalLots).toStrictEqual([
      {
        ...initialLots[0],
        remainingQuantity: 3,
        recordUpdatedAt: expect.any(Date),
      },
      {
        ...initialLots[1],
        remainingQuantity: 3,
        recordUpdatedAt: expect.any(Date),
      },
      initialLots[2],
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      {
        ...initialHoldingStats[0],
        totalQuantity: 3,
        totalPresentInvestedAmount: 3.4499999999999997,
      },
      {
        ...initialHoldingStats[1],
        totalQuantity: 3,
        totalPresentInvestedAmount: 3.75,
      },
      initialHoldingStats[2],
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      { ...initialPortfolioStats[0], totalPresentInvestedAmount: 3.4499999999999997 },
      { ...initialPortfolioStats[1], totalPresentInvestedAmount: 7.199999999999999 },
      { ...initialPortfolioStats[2], totalPresentInvestedAmount: 9.799999999999999 },
    ]);
  });

  it('Importing a trade dataset that updates some sales of lots for some holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 3,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: -1,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 3,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(3),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-04, 00:00:00'),
          quantity: -2,
          price: 1.3,
        },
        {
          id: mockUuidFromNumber(4),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-05, 00:00:00'),
          quantity: 2,
          price: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          remainingQuantity: 2,
          realizedProfitOrLoss: 0.1,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-03, 00:00:00'),
          remainingQuantity: 1,
          realizedProfitOrLoss: 0.2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[4].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-05, 00:00:00'),
          remainingQuantity: 2,
          realizedProfitOrLoss: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 3,
          totalPresentInvestedAmount: 3.3,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 1.1,
          totalRealizedProfitOrLossAmount: 0.1,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 3,
          totalPresentInvestedAmount: 3.6,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 1,
          totalPresentInvestedAmount: 2.4,
          totalRealizedAmount: 1.2,
          totalRealizedProfitOrLossAmount: 0.3,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[4].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-05, 00:00:00'),
          totalLotCount: 1,
          totalQuantity: 2,
          totalPresentInvestedAmount: 4,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 3.3,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 1.2,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 5.8,
          totalRealizedAmount: 1.2,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[3].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalPresentInvestedAmount: 3.2,
          totalRealizedAmount: 3.8,
          totalRealizedProfitOrLossAmount: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[4].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-05, 00:00:00'),
          totalPresentInvestedAmount: 7.2,
          totalRealizedAmount: 3.8,
          totalRealizedProfitOrLossAmount: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",3,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",-2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-03, 00:00:00",3,1.2
      Trades,Data,Stocks,AAPL,"2024-01-04, 00:00:00",-3,1.3
      Trades,Data,Stocks,NVDA,"2024-01-05, 00:00:00",2,2
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 0,
          tradesModifiedCount: 2,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['AAPL', 'ADBE'],
        remove: [],
      },
      lots: {
        set: [initialLots[0].id, initialLots[1].id],
        remove: [],
      },
    });

    expect(allFinalTrades).toStrictEqual([
      initialTrades[0],
      {
        ...initialTrades[1],
        recordUpdatedAt: expect.any(Date),
        quantity: -2,
      },
      initialTrades[2],
      {
        ...initialTrades[3],
        recordUpdatedAt: expect.any(Date),
        quantity: -3,
      },
      initialTrades[4],
    ]);

    expect(allFinalLots).toStrictEqual([
      {
        ...initialLots[0],
        recordUpdatedAt: expect.any(Date),
        remainingQuantity: 1,
        realizedProfitOrLoss: 0.19999999999999973,
      },
      {
        ...initialLots[1],
        recordUpdatedAt: expect.any(Date),
        remainingQuantity: 0,
        realizedProfitOrLoss: 0.30000000000000027,
      },
      initialLots[2],
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      {
        ...initialHoldingStats[0],
        symbol: 'ADBE',
        totalLotCount: 1,
        totalQuantity: 3,
        totalPresentInvestedAmount: 3.3000000000000003,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ...initialHoldingStats[1],
        symbol: 'ADBE',
        totalLotCount: 1,
        totalQuantity: 1,
        totalPresentInvestedAmount: 1.1,
        totalRealizedAmount: 2.4,
        totalRealizedProfitOrLossAmount: 0.19999999999999973,
        totalRealizedProfitOrLossRate: 0.09090909090909083,
      },
      {
        ...initialHoldingStats[2],
        symbol: 'AAPL',
        totalLotCount: 1,
        totalQuantity: 3,
        totalPresentInvestedAmount: 3.5999999999999996,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ...initialHoldingStats[3],
        symbol: 'AAPL',
        totalLotCount: 0,
        totalQuantity: 0,
        totalPresentInvestedAmount: 0,
        totalRealizedAmount: 3.9000000000000004,
        totalRealizedProfitOrLossAmount: 0.30000000000000027,
        totalRealizedProfitOrLossRate: 0.08333333333333348,
      },
      initialHoldingStats[4],
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      {
        ...initialPortfolioStats[0],
        totalPresentInvestedAmount: 3.3000000000000003,
      },
      {
        ...initialPortfolioStats[1],
        totalPresentInvestedAmount: 1.1,
        totalRealizedAmount: 2.4,
        totalRealizedProfitOrLossAmount: 0.19999999999999973,
        totalRealizedProfitOrLossRate: 0.09090909090909083,
      },
      {
        ...initialPortfolioStats[2],
        totalPresentInvestedAmount: 4.699999999999999,
        totalRealizedAmount: 2.4,
        totalRealizedProfitOrLossAmount: 0.19999999999999973,
        totalRealizedProfitOrLossRate: 0.09090909090909083,
      },
      {
        ...initialPortfolioStats[3],
        totalPresentInvestedAmount: 1.0999999999999996,
        totalRealizedAmount: 6.300000000000001,
        totalRealizedProfitOrLossAmount: 0.5,
        totalRealizedProfitOrLossRate: 0.7500000000000004,
      },
      {
        ...initialPortfolioStats[4],
        totalPresentInvestedAmount: 5.1,
        totalRealizedAmount: 6.300000000000001,
        totalRealizedProfitOrLossAmount: 0.5,
        totalRealizedProfitOrLossRate: 0.7500000000000004,
      },
    ]);
  });

  it('Importing a trade dataset that reopens previously closed holding in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: -2,
          price: 1.2,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-03, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0.19999999999999973,
          remainingQuantity: 0,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-03, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalLotCount: 1,
          totalQuantity: 2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 0,
          totalLotCount: 0,
          totalQuantity: 0,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.19999999999999973,
          totalRealizedProfitOrLossRate: 0.09090909090909083,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalLotCount: 1,
          totalQuantity: 2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 0,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.19999999999999973,
          totalRealizedProfitOrLossRate: 0.09090909090909083,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-03, 00:00:00'),
          totalPresentInvestedAmount: 2.6,
          totalRealizedAmount: 2.4,
          totalRealizedProfitOrLossAmount: 0.19999999999999973,
          totalRealizedProfitOrLossRate: 0.09090909090909083,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",-2,1.2
      Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",2,1.3
      Trades,Data,Stocks,ADBE,"2024-01-04, 00:00:00",2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 1,
          tradesModifiedCount: 0,
          tradesRemovedCount: 0,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(recs => recs.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(recs =>
        recs.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: {
        set: [{ forCurrency: 'USD' }],
        remove: [],
      },
      holdingStats: {
        set: ['ADBE'],
        remove: [],
      },
      lots: {
        set: [allFinalLots[2].id],
        remove: [],
      },
    });

    const tradeCommonFieldsToAssert = {
      ownerId: mockUserId1,
      id: expect.any(String),
      recordCreatedAt: expect.any(Date),
      recordUpdatedAt: expect.any(Date),
    };

    expect(allFinalTrades).toStrictEqual([
      initialTrades[0],
      initialTrades[1],
      initialTrades[2],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-04, 00:00:00'),
        quantity: 2,
        price: 1.4,
      },
    ]);

    expect(allFinalLots).toStrictEqual([
      initialLots[0],
      initialLots[1],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-04, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[0],
      initialHoldingStats[1],
      initialHoldingStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[3].id,
        symbol: 'ADBE',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalLotCount: 1,
        totalQuantity: 2,
        totalPresentInvestedAmount: 2.8,
        totalRealizedAmount: 2.4,
        totalRealizedProfitOrLossAmount: 0.19999999999999973,
        totalRealizedProfitOrLossRate: 0.09090909090909083,
      },
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      initialPortfolioStats[0],
      initialPortfolioStats[1],
      initialPortfolioStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: allFinalTrades[3].id,
        forCurrency: 'USD',
        changedAt: new Date('2024-01-04, 00:00:00'),
        totalPresentInvestedAmount: 5.4,
        totalRealizedAmount: 2.4,
        totalRealizedProfitOrLossAmount: 0.19999999999999973,
        totalRealizedProfitOrLossRate: 0.09090909090909083,
      },
    ]);
  });

  it('Importing a trade dataset that both removes a holding and modifies holdings in the portfolio', async () => {
    const initialTrades = (
      await TradeRecordModel.bulkCreate([
        {
          id: mockUuidFromNumber(0),
          ownerId: mockUserId1,
          symbol: 'NVDA',
          performedAt: new Date('2024-01-01, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(1),
          ownerId: mockUserId1,
          symbol: 'ADBE',
          performedAt: new Date('2024-01-02, 00:00:00'),
          quantity: 2,
          price: 1.1,
        },
        {
          id: mockUuidFromNumber(2),
          ownerId: mockUserId1,
          symbol: 'AAPL',
          performedAt: new Date('2024-01-04, 00:00:00'),
          quantity: 2,
          price: 1.3,
        },
      ])
    ).map(record => record.dataValues);

    const initialLots = (
      await LotModel.bulkCreate([
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          openedAt: new Date('2024-01-01, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          openedAt: new Date('2024-01-02, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
        {
          ownerId: mockUserId1,
          openingTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          openedAt: new Date('2024-01-04, 00:00:00'),
          realizedProfitOrLoss: 0,
          remainingQuantity: 2,
        },
      ])
    ).map(record => record.dataValues);

    const initialHoldingStats = (
      await PositionChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          symbol: 'NVDA',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalLotCount: 1,
          totalPresentInvestedAmount: 2.2,
          totalQuantity: 2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          symbol: 'ADBE',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalLotCount: 1,
          totalPresentInvestedAmount: 2.2,
          totalQuantity: 2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          symbol: 'AAPL',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalLotCount: 1,
          totalPresentInvestedAmount: 2.6,
          totalQuantity: 2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const initialPortfolioStats = (
      await CurrencyStatsChangeModel.bulkCreate([
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[0].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-01, 00:00:00'),
          totalPresentInvestedAmount: 4.4,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[1].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-02, 00:00:00'),
          totalPresentInvestedAmount: 2.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
        {
          ownerId: mockUserId1,
          relatedTradeId: initialTrades[2].id,
          forCurrency: 'USD',
          changedAt: new Date('2024-01-04, 00:00:00'),
          totalPresentInvestedAmount: 5.2,
          totalRealizedAmount: 0,
          totalRealizedProfitOrLossAmount: 0,
          totalRealizedProfitOrLossRate: 0,
        },
      ])
    ).map(record => record.dataValues);

    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.1
      Trades,Data,Stocks,ADBE,"2024-01-03, 00:00:00",2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-04, 00:00:00",2,1.3
      Trades,Data,Stocks,AAPL,"2024-01-05, 00:00:00",2,1.4
    `.trim();

    const redisEventPromise = pipe(
      userHoldingsChangedTopic.subscribe(testRedisSubscriber, {
        targetOwnerIds: [mockUserId1],
      }),
      itTakeFirst()
    );

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: {
        setTrades: {
          tradesAddedCount: 2,
          tradesModifiedCount: 0,
          tradesRemovedCount: 1,
        },
      },
    });

    const [
      redisEvent,
      allFinalTrades,
      allFinalLots,
      allFinalHoldingStatsChanges,
      allFinalPortfolioStatsChanges,
    ] = await Promise.all([
      redisEventPromise,
      TradeRecordModel.findAll({ order: [['performedAt', 'ASC']] }).then(r =>
        r.map(r => r.dataValues)
      ),
      LotModel.findAll({ order: [['openedAt', 'ASC']] }).then(r => r.map(r => r.dataValues)),
      PositionChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(r =>
        r.map(r => r.dataValues)
      ),
      CurrencyStatsChangeModel.findAll({ order: [['changedAt', 'ASC']] }).then(r =>
        r.map(r => r.dataValues)
      ),
    ]);

    expect(redisEvent).toStrictEqual({
      ownerId: mockUserId1,
      portfolioStats: { set: [{ forCurrency: 'USD' }], remove: [] },
      holdingStats: { set: ['AAPL', 'ADBE'], remove: ['NVDA'] },
      lots: {
        set: [allFinalLots[1].id, allFinalLots[3].id],
        remove: [initialLots[0].id],
      },
    });

    const tradeCommonFieldsToAssert = {
      ownerId: mockUserId1,
      id: expect.any(String),
      recordCreatedAt: expect.any(Date),
      recordUpdatedAt: expect.any(Date),
    };

    expect(allFinalTrades).toStrictEqual([
      initialTrades[1],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'ADBE',
        performedAt: new Date('2024-01-03, 00:00:00'),
        quantity: 2,
        price: 1.2,
      },
      initialTrades[2],
      {
        ...tradeCommonFieldsToAssert,
        symbol: 'AAPL',
        performedAt: new Date('2024-01-05, 00:00:00'),
        quantity: 2,
        price: 1.4,
      },
    ]);

    expect(allFinalLots).toStrictEqual([
      initialLots[1],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'ADBE',
        openedAt: new Date('2024-01-03, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
      initialLots[2],
      {
        ownerId: mockUserId1,
        id: expect.any(String),
        openingTradeId: expect.any(String),
        symbol: 'AAPL',
        openedAt: new Date('2024-01-05, 00:00:00'),
        recordCreatedAt: expect.any(Date),
        recordUpdatedAt: expect.any(Date),
        realizedProfitOrLoss: 0,
        remainingQuantity: 2,
      },
    ]);

    expect(allFinalHoldingStatsChanges).toStrictEqual([
      initialHoldingStats[1],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'ADBE',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalLotCount: 2,
        totalPresentInvestedAmount: 4.6,
        totalQuantity: 4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      initialHoldingStats[2],
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        symbol: 'AAPL',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalLotCount: 2,
        totalPresentInvestedAmount: 5.4,
        totalQuantity: 4,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);

    expect(allFinalPortfolioStatsChanges).toStrictEqual([
      {
        ...initialPortfolioStats[1],
        totalPresentInvestedAmount: 2.2,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-03, 00:00:00'),
        totalPresentInvestedAmount: 4.6,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
      {
        ...initialPortfolioStats[2],
        totalPresentInvestedAmount: 7.199999999999999,
      },
      {
        ownerId: mockUserId1,
        relatedTradeId: expect.any(String),
        forCurrency: 'USD',
        changedAt: new Date('2024-01-05, 00:00:00'),
        totalPresentInvestedAmount: 10,
        totalRealizedAmount: 0,
        totalRealizedProfitOrLossAmount: 0,
        totalRealizedProfitOrLossRate: 0,
      },
    ]);
  });

  it('Importing a trade dataset containing multiple trades equal <symbol + date> combinations', async () => {
    const tradesCsv = `
      Trades,Header,Asset Category,Symbol,Date/Time,Quantity,T. Price
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",1,1.1
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",2,1.2
      Trades,Data,Stocks,ADBE,"2024-01-01, 00:00:00",3,1.3
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",1,1.1
      Trades,Data,Stocks,ADBE,"2024-01-02, 00:00:00",2,1.2
      Trades,Data,Stocks,AAPL,"2024-01-03, 00:00:00",1,1.1
      Trades,Data,Stocks,AAPL,"2024-01-03, 00:00:00",2,1.2
      Trades,Data,Stocks,NVDA,"2024-01-03, 00:00:00",10,1.1
    `.trim();

    const resp = await axiosGqlClient({
      data: {
        variables: { tradesCsv },
        query: /* GraphQL */ `
          mutation ($tradesCsv: String!) {
            setTrades(input: { mode: REPLACE, data: { csv: $tradesCsv } }) {
              tradesAddedCount
              tradesModifiedCount
              tradesRemovedCount
            }
          }
        `,
      },
    });

    expect(resp.data).toStrictEqual({
      data: null,
      errors: [
        {
          message:
            'Importing multiple trades with the same symbol and date combination is not supported; ' +
            'detected duplicate pairs are (3): ' +
            '[ADBE + 2023-12-31T22:00:00.000Z], ' +
            '[ADBE + 2024-01-01T22:00:00.000Z], ' +
            '[AAPL + 2024-01-02T22:00:00.000Z]',
          extensions: {
            code: 'DUPLICATE_TRADES',
            duplicatePairsDetected: [
              { symbol: 'ADBE', timestamp: '2023-12-31T22:00:00.000Z' },
              { symbol: 'ADBE', timestamp: '2024-01-01T22:00:00.000Z' },
              { symbol: 'AAPL', timestamp: '2024-01-02T22:00:00.000Z' },
            ],
          },
          path: ['setTrades'],
          locations: [{ column: 13, line: 3 }],
        },
      ],
    });
  });
});
