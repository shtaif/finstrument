import { asyncMap } from 'iter-tools';
import pipe from '../pipe';
import myIterableCleanupPatcher from '../myIterableCleanupPatcher';
import sseJsonIterable from '../sseJsonIterable';
// import sseJsonIterable2 from '../sseJsonIterable2';

const backendApiClient = {
  getCurrentRevenueData,
  observePositionChanges,
  observeRevenueDataChanges,
};

export {
  backendApiClient as default,
  type RevenueDataMessage,
  type SymbolPriceStatus,
  type PositionDataMessage,
};

function observePositionChanges(params: { userAlias: string }): AsyncIterable<PositionDataMessage> {
  const { userAlias } = params;
  const liveRevenueData = sseJsonIterable<{
    success: boolean;
    data: PositionDataMessage;
  }>(`${backendApiBaseUrl}/live-position-data/${userAlias}`);
  return pipe(
    liveRevenueData,
    // TODO: Handle errors, like the `message.success` possibly being `false`?...
    myIterableCleanupPatcher(asyncMap(({ data }) => data))
  );
}

function observeRevenueDataChanges(params: {
  userAlias: string;
}): AsyncIterable<RevenueDataMessage> {
  const { userAlias } = params;
  const liveRevenueData = sseJsonIterable<{
    success: boolean;
    data: RevenueDataMessage;
  }>(`${backendApiBaseUrl}/live-revenue-data/${userAlias}`);
  return pipe(
    liveRevenueData,
    // TODO: Handle errors, like the `message.success` possibly being `false`?...
    myIterableCleanupPatcher(asyncMap(({ data }) => data))
  );
}

async function getCurrentRevenueData(params: { userAlias: string }): Promise<RevenueDataMessage> {
  const { userAlias } = params;

  const revenueIterator = observeRevenueDataChanges({ userAlias })[Symbol.asyncIterator]();

  try {
    const currentRevenueData = (await revenueIterator.next()).value;
    return currentRevenueData;
  } finally {
    await revenueIterator.return?.();
  }
}

const backendApiBaseUrl = `${import.meta.env.VITE_API_URL}/api`;

type RevenueDataMessage = {
  updatesBySymbol: {
    [symbol: string]: {
      price: SymbolPriceStatus;
      aggregateRevenue: {
        percent: number;
        amount: number;
      };
      individualPositionRevenues?: {
        position: {
          date: string;
          remainingQuantity: number;
          price: number;
        };
        revenue: {
          percent: number;
          amount: number;
        };
      }[];
    };
  };
};

type PositionDataMessage = {
  positions: {
    [symbol: string]: {
      totalQuantity: number;
      breakEvenPrice: number;
      // individualPositions: {
      //   date: string;
      //   originalQuantity: number;
      //   remainingQuantity: number;
      //   soldQuantity: number;
      //   price: number;
      // }[];
    };
  };
};

type SymbolPriceStatus = {
  regularMarketPrice: number;
  regularMarketTime: string;
  marketState: 'REGULAR' | 'CLOSED' | 'PRE' | 'PREPRE' | 'POST' | 'POSTPOST';
};

// const updatedSymbolPriceMapSchema = z.record(
//   z.string().min(1),
//   z.object({
//     regularMarketPrice: z.number().positive(),
//     regularMarketTime: z.coerce.date(),
//   })
// );
