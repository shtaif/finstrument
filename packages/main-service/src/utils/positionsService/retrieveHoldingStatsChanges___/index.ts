import { QueryTypes } from 'sequelize';
import { mapValues } from 'lodash-es';
import { escapeDbCol } from '../../escapeDbCol.js';
import {
  sequelize,
  pgSchemaName,
  HoldingStatsChangeModel,
  UserModel,
  PortfolioCompositionChangeModel,
  type HoldingStatsChangeModelAttributes,
} from '../../../db/index.js';

export {
  retrieveHoldingStatsChanges,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
};

async function retrieveHoldingStatsChanges(params: {
  latestPerOwnerAndSymbol?: boolean;
  filters: {
    ownerIds?: readonly string[];
    ownerAliases?: readonly string[];
    relatedTradeIds?: readonly string[];
    symbols?: readonly string[];
  };
  orderBy?: [
    (
      | 'changedAt'
      | 'symbol'
      | 'totalPositionCount'
      | 'totalQuantity'
      | 'totalPresentInvestedAmount'
      | 'totalRealizedAmount'
      | 'portfolioPortion'
    ),
    'ASC' | 'DESC',
  ];
  pagination?: {
    offset?: number;
    limit?: number;
  };
}): Promise<HoldingStatsChange[]> {
  const normParams = {
    latestPerOwnerAndSymbol: params.latestPerOwnerAndSymbol ?? false,
    filters: {
      symbols: params.filters.symbols ?? [],
      ownerIds: params.filters.ownerIds ?? [],
      ownerAliases: params.filters.ownerAliases ?? [],
      relatedTradeIds: params.filters.relatedTradeIds ?? [],
    },
    pagination: {
      offset: params.pagination?.offset ?? 0,
      limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
    },
    orderBy: params.orderBy ?? ['changedAt', 'DESC'],
  } satisfies typeof params;

  if (
    normParams.filters.ownerAliases.length === 0 &&
    normParams.filters.ownerIds.length === 0 &&
    normParams.filters.relatedTradeIds.length === 0 &&
    normParams.filters.symbols.length === 0
  ) {
    return [];
  }

  const holdingModelFields = mapValues(HoldingStatsChangeModel.getAttributes(), atr => atr!.field);
  const userModelFields = mapValues(UserModel.getAttributes(), atr => atr!.field);
  const portfolioCompositionModel = mapValues(
    PortfolioCompositionChangeModel.getAttributes(),
    atr => atr!.field
  );

  const holdingStatsChanges = await sequelize.query<HoldingStatsChange>(
    `
      WITH holding_stats_base AS (
        ${(() => {
          const latestRespectiveHoldingStats = `
            SELECT
              DISTINCT ON (
                "${holdingModelFields.ownerId}",
                "${holdingModelFields.symbol}"
              )
              *
            FROM
              "${pgSchemaName}"."${HoldingStatsChangeModel.tableName}"
            ORDER BY
              "${holdingModelFields.ownerId}",
              "${holdingModelFields.symbol}",
              "${holdingModelFields.changedAt}" DESC
          `;
          const regularHoldingStats = `SELECT * FROM "${pgSchemaName}"."${HoldingStatsChangeModel.tableName}"`;
          return normParams.latestPerOwnerAndSymbol
            ? latestRespectiveHoldingStats
            : regularHoldingStats;
        })()}
      )

      SELECT
        ${(
          [
            'ownerId',
            'relatedTradeId',
            'symbol',
            'totalPositionCount',
            'totalQuantity',
            'totalPresentInvestedAmount',
            'totalRealizedAmount',
            'totalRealizedProfitOrLossAmount',
            'totalRealizedProfitOrLossRate',
            'changedAt',
          ] as const
        )
          .map(modelName => `hs."${holdingModelFields[modelName]}" AS "${modelName}",\n`)
          .join('')}
        hs."${holdingModelFields.totalPresentInvestedAmount}" / hs."${holdingModelFields.totalQuantity}" AS "breakEvenPrice",
        pcc.${portfolioCompositionModel.portion} AS "portfolioPortion"
      FROM
        holding_stats_base AS hs
        INNER JOIN "${pgSchemaName}"."${UserModel.tableName}" AS u ON
          hs."${holdingModelFields.ownerId}" = u."${userModelFields.id}"
        LEFT JOIN "${pgSchemaName}"."${PortfolioCompositionChangeModel.tableName}" AS pcc ON
          hs."${holdingModelFields.relatedTradeId}" = pcc."${portfolioCompositionModel.relatedHoldingChangeId}" AND
          pcc."${portfolioCompositionModel.symbol}" = hs."${holdingModelFields.symbol}"
      WHERE
        ${[
          normParams.filters.ownerIds.length && `u."${userModelFields.id}" IN (:ownerIds)`,
          normParams.filters.ownerAliases.length &&
            `u."${userModelFields.alias}" IN (:ownerAliases)`,
          normParams.filters.relatedTradeIds.length &&
            `hs."${holdingModelFields.relatedTradeId}" IN (:relatedTradeIds)`,
        ]
          .filter(Boolean)
          .join(' OR\n')}
        ${normParams.filters.symbols.length ? ` AND hs."${holdingModelFields.symbol}" IN (:symbols)` : ''}
      ORDER BY
        ${escapeDbCol(normParams.orderBy[0])} ${normParams.orderBy[1] === 'DESC' ? 'DESC' : 'ASC'}
      OFFSET :offset
      LIMIT :limit;
    `,
    {
      replacements: {
        ownerIds: normParams.filters.ownerIds,
        ownerAliases: normParams.filters.ownerAliases,
        relatedTradeIds: normParams.filters.relatedTradeIds,
        symbols: normParams.filters.symbols,
        offset: normParams.pagination.offset,
        limit: normParams.pagination.limit,
      },
      type: QueryTypes.SELECT,
    }
  );

  return holdingStatsChanges;
}

type RetrieveHoldingStatsChangesParams = Parameters<typeof retrieveHoldingStatsChanges>[0];

type HoldingStatsChange = HoldingStatsChangeModelAttributes & {
  portfolioPortion: number;
  breakEvenPrice: number;
};
