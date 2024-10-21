import { keyBy } from 'lodash-es';
import { pipe } from 'shared-utils';
import { itTakeFirst } from 'iterable-operators';
import DataLoader from 'dataloader';
import { getLiveMarketData } from '../../utils/getLiveMarketData/index.js';

export { createLotMarketDataLoader, type LotPnlUpdate };

function createLotMarketDataLoader(): DataLoader<string, LotPnlUpdate | undefined> {
  return new DataLoader(async lotIds => {
    const positionMarketDatas = (await pipe(
      getLiveMarketData({
        specifiers: lotIds.map(lotId => ({
          type: 'LOT',
          lotId,
        })),
        fields: {
          lots: {
            lot: { id: true },
            pnl: {
              amount: true,
              percent: true,
            },
          },
        },
      }),
      itTakeFirst()
    ))!;

    const positionDatasById = keyBy(positionMarketDatas.lots, ({ lot }) => lot.id);

    return lotIds.map(lotId => positionDatasById[lotId]);
  });
}

type LotPnlUpdate = {
  lot: {
    id: string;
  };
  pnl: {
    amount: number;
    percent: number;
  };
};
