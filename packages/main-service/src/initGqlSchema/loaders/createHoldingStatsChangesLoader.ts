import DataLoader from 'dataloader';
import { keyBy } from 'lodash';
import { positionsService, type HoldingStatsChange } from '../../utils/positionsService/index.js';

export { createHoldingStatsChangesLoader };

function createHoldingStatsChangesLoader() {
  return new DataLoader<string, HoldingStatsChange, string>(async relatedTradeIds => {
    const holdingChanges = await positionsService.retrieveHoldingStatsChanges({
      filters: { relatedTradeIds },
    });

    const mappedHoldingChanges = keyBy(holdingChanges, ({ relatedTradeId }) => relatedTradeId);

    return relatedTradeIds.map(relatedTradeId => mappedHoldingChanges[relatedTradeId]);
  });
}
