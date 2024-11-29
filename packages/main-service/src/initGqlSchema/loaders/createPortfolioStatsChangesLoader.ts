import DataLoader from 'dataloader';
import { keyBy } from 'lodash-es';
import { positionsService, type CurrencyStatsChange } from '../../utils/positionsService/index.js';

export { createPortfolioStatsChangesLoader };

function createPortfolioStatsChangesLoader() {
  return new DataLoader<
    { relatedTradeId: string; includeCompositions?: boolean },
    CurrencyStatsChange<boolean, boolean>,
    string
  >(
    async inputs => {
      const [relatedTradeIds, includeCompositions] = [
        inputs.map(input => input.relatedTradeId),
        inputs.some(input => !!input.includeCompositions),
      ];

      // TODO: Fix `includeCompositions`?

      const portfolioChanges = await positionsService.retrieveCurrencyStatsChanges({
        filters: { relatedTradeIds },
        // includeCompositions,
      });

      const mappedPortfolioChanges = keyBy(
        portfolioChanges,
        ({ relatedTradeId }) => relatedTradeId
      );

      return inputs.map(({ relatedTradeId }) => mappedPortfolioChanges[relatedTradeId]);
    },
    {
      cacheKeyFn: ({ relatedTradeId, includeCompositions = false }) =>
        `${relatedTradeId}_${includeCompositions}`,
    }
  );
}
