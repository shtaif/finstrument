import { keyBy } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import { getLiveMarketData } from '../../utils/getLiveMarketData/index.js';

export { createPositionMarketDataLoader, type PositionPnlUpdate };

function createPositionMarketDataLoader(): DataLoader<string, PositionPnlUpdate | undefined> {
  return new DataLoader(async positionIds => {
    const positionMarketDatas = (await pipe(
      getLiveMarketData({
        specifiers: positionIds.map(positionId => ({
          type: 'POSITION',
          positionId,
        })),
        fields: {
          positions: {
            position: { id: true },
            pnl: {
              amount: true,
              percent: true,
            },
          },
        },
      }),
      itTakeFirst()
    ))!;

    const positionDatasById = keyBy(positionMarketDatas.positions, ({ position }) => position.id);

    return positionIds.map(positionId => positionDatasById[positionId]);
  });
}

type PositionPnlUpdate = {
  position: {
    id: string;
  };
  pnl: {
    amount: number;
    percent: number;
  };
};
