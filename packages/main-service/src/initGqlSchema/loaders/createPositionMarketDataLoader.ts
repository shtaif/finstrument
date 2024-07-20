import { keyBy } from 'lodash';
import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import {
  getLiveMarketData,
  type PositionMarketStatsUpdate,
} from '../../utils/getLiveMarketData/index.js';

export { createPositionMarketDataLoader, type PositionMarketStatsUpdate };

function createPositionMarketDataLoader(): DataLoader<
  string,
  PositionMarketStatsUpdate<true, true> | undefined
> {
  return new DataLoader(async positionIds => {
    const positionMarketDatas = (await pipe(
      getLiveMarketData({
        specifiers: positionIds.map(positionId => ({
          type: 'POSITION',
          positionId,
        })),
        include: { priceData: true, unrealizedPnl: true },
      }),
      itTakeFirst()
    ))!;

    const positionDatasById = keyBy(positionMarketDatas.positions, ({ position }) => position.id);

    return positionIds.map(positionId => positionDatasById[positionId]);
  });
}
