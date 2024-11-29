import DataLoader from 'dataloader';
import { keyBy } from 'lodash-es';
import { positionsService, type CurrencyStatsChange } from '../../utils/positionsService/index.js';

export { createPortfolioStatsLoader };

function createPortfolioStatsLoader() {
  return new DataLoader<
    {
      ownerId: string;
      includeCompositions?: boolean;
    },
    CurrencyStatsChange<boolean, boolean>
  >(async inputs => {
    const [ownerIds, includeCompositions] = [
      inputs.map(input => input.ownerId),
      inputs.some(input => !!input.includeCompositions),
    ];

    const portfolioStats = await positionsService.retrieveCurrencyStatsChanges({
      filters: {
        ownerIds,
      },
      latestPerOwner: true,
      includeCompositions,
    });

    const mappedPortfolioStats = keyBy(portfolioStats, ({ ownerId }) => ownerId);

    return inputs.map(({ ownerId }) => mappedPortfolioStats[ownerId]);
  });
}
