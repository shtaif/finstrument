import { combineLatest } from 'ix/asynciterable/combinelatest';
import { scan } from 'ix/asynciterable/operators/scan';
import pipe from '../pipe';
import backendApiClient, {
  type PositionDataMessage,
  type RevenueDataMessage,
} from '../backendApiClient';

export { observePositionAndRevenueData, type UpdatedPositionAndRevenueData };

function observePositionAndRevenueData(params: {
  userAlias: string;
}): AsyncIterable<UpdatedPositionAndRevenueData> {
  const { userAlias } = params;

  const posData = backendApiClient.observePositionChanges({ userAlias });
  const revenueData = backendApiClient.observeRevenueDataChanges({ userAlias });

  return {
    [Symbol.asyncIterator]() {
      const posDataIterator = posData[Symbol.asyncIterator]();
      const revenueDataIterator = revenueData[Symbol.asyncIterator]();

      const posAndRevCombined = pipe(
        combineLatest(
          { [Symbol.asyncIterator]: () => posDataIterator },
          { [Symbol.asyncIterator]: () => revenueDataIterator }
        ),
        scan({
          seed: { latestPositions: {}, latestRevenue: {} } as UpdatedPositionAndRevenueData,
          callback: (combined, [updatedPositions, revenueUpdates]) => ({
            latestPositions: updatedPositions.positions,
            latestRevenue: { ...combined.latestRevenue, ...revenueUpdates.updatesBySymbol },
          }),
        })
      );

      const iterator = posAndRevCombined[Symbol.asyncIterator]();

      return {
        next: () => iterator.next(),
        return: async () => {
          await Promise.all([posDataIterator.return!(), revenueDataIterator.return!()]);
          return await iterator.return!();
        },
      };
    },
  };
}

type UpdatedPositionAndRevenueData = {
  latestPositions: PositionDataMessage['positions'];
  latestRevenue: RevenueDataMessage['updatesBySymbol'];
};
