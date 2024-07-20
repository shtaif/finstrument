import {
  observePositionAndRevenueData,
  type UpdatedPositionAndRevenueData,
} from '../observePositionAndRevenueData';

export { getCurrentPositionAndRevenueData };

async function getCurrentPositionAndRevenueData(params: {
  userAlias: string;
}): Promise<UpdatedPositionAndRevenueData> {
  const { userAlias } = params;
  const livePosAndRevDataIt = observePositionAndRevenueData({ userAlias })[Symbol.asyncIterator]();
  try {
    const currPosAndRevData = (await livePosAndRevDataIt.next()).value;
    return currPosAndRevData;
  } finally {
    await livePosAndRevDataIt.return?.();
  }
}
