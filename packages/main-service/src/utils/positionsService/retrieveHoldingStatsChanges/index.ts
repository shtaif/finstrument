import { QueryTypes } from 'sequelize';
import { mapValues } from 'lodash-es';
import {
  sequelize,
  pgSchemaName,
  PositionChangeModel,
  UserModel,
  PortfolioCompositionChangeModel,
  type PositionChangeModelAttributes,
} from '../../../db/index.js';
import {
  buildWhereClauseFromLogicCombinables,
  type LogicCombinable,
} from '../../buildWhereClauseFromLogicCombinables.js';
import { escapeDbCol } from '../../escapeDbCol.js';
import { sequelizeEscapeArray } from '../../sequelizeEscapeArray.js';

export {
  retrieveHoldingStatsChanges,
  type RetrieveHoldingStatsChangesParams,
  type HoldingStatsChange,
};

async function retrieveHoldingStatsChanges(params: {
  latestPerOwnerAndSymbol?: boolean;
  filters: LogicCombinable<{
    ownerIds?: readonly string[];
    ownerAliases?: readonly string[];
    relatedTradeIds?: readonly string[];
    symbols?: readonly string[];
  }>;
  orderBy?: [
    (
      | 'changedAt'
      | 'symbol'
      | 'totalLotCount'
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
    filters: params.filters,
    pagination: {
      offset: params.pagination?.offset ?? 0,
      limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
    },
    orderBy: params.orderBy ?? ['changedAt', 'DESC'],
  } satisfies typeof params;

  const positionModelFields = mapValues(PositionChangeModel.getAttributes(), atr => atr!.field);
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
                "${positionModelFields.ownerId}",
                "${positionModelFields.symbol}"
              )
              *
            FROM
              "${pgSchemaName}"."${PositionChangeModel.tableName}"
            ORDER BY
              "${positionModelFields.ownerId}",
              "${positionModelFields.symbol}",
              "${positionModelFields.changedAt}" DESC
          `;
          const regularHoldingStats = `SELECT * FROM "${pgSchemaName}"."${PositionChangeModel.tableName}"`;
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
            'totalLotCount',
            'totalQuantity',
            'totalPresentInvestedAmount',
            'totalRealizedAmount',
            'totalRealizedProfitOrLossAmount',
            'totalRealizedProfitOrLossRate',
            'changedAt',
          ] as const
        )
          .map(modelName => `hs."${positionModelFields[modelName]}" AS "${modelName}",\n`)
          .join('')}
        hs."${positionModelFields.totalPresentInvestedAmount}" / hs."${positionModelFields.totalQuantity}" AS "breakEvenPrice",
        pcc.${portfolioCompositionModel.portion} AS "portfolioPortion"

      FROM
        holding_stats_base AS hs
        INNER JOIN "${pgSchemaName}"."${UserModel.tableName}" AS u ON
          hs."${positionModelFields.ownerId}" = u."${userModelFields.id}"
        LEFT JOIN "${pgSchemaName}"."${PortfolioCompositionChangeModel.tableName}" AS pcc ON
          hs."${positionModelFields.relatedTradeId}" = pcc."${portfolioCompositionModel.relatedHoldingChangeId}" AND
          pcc."${portfolioCompositionModel.symbol}" = hs."${positionModelFields.symbol}"

      ${buildWhereClauseFromLogicCombinables(normParams.filters, {
        ownerIds: val =>
          !val.length ? '' : `u."${userModelFields.id}" IN (${sequelizeEscapeArray(val)})`,
        ownerAliases: val =>
          !val.length ? '' : `u."${userModelFields.alias}" IN (${sequelizeEscapeArray(val)})`,
        symbols: val =>
          !val.length ? '' : `hs."${positionModelFields.symbol}" IN (${sequelizeEscapeArray(val)})`,
        relatedTradeIds: val =>
          !val.length
            ? ''
            : `hs."${positionModelFields.relatedTradeId} IN (${sequelizeEscapeArray(val)})`,
      })}

      ORDER BY
        ${escapeDbCol(normParams.orderBy[0])} ${normParams.orderBy[1] === 'DESC' ? 'DESC' : 'ASC'}

      OFFSET :offset
      LIMIT :limit;
    `,
    {
      replacements: {
        offset: normParams.pagination.offset,
        limit: normParams.pagination.limit,
      },
      type: QueryTypes.SELECT,
    }
  );

  return holdingStatsChanges;
}

type RetrieveHoldingStatsChangesParams = Parameters<typeof retrieveHoldingStatsChanges>[0];

type HoldingStatsChange = PositionChangeModelAttributes & {
  portfolioPortion: number;
  breakEvenPrice: number;
};
