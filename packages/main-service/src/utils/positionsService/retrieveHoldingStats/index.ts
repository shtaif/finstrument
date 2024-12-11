import { QueryTypes, type Transaction } from 'sequelize';
import { mapValues } from 'lodash-es';
import {
  sequelize,
  pgSchemaName,
  PositionChangeModel,
  PortfolioCompositionChangeModel,
  TradeRecordModel,
  UserModel,
} from '../../../db/index.js';
import { escapeDbCol } from '../../escapeDbCol.js';
import {
  buildWhereClauseFromLogicCombinables,
  type LogicCombinable,
} from '../../buildWhereClauseFromLogicCombinables.js';
import { sequelizeEscapeArray } from '../../sequelizeEscapeArray.js';

export { retrieveHoldingStats, type HoldingStats };

async function retrieveHoldingStats(params: {
  filters: LogicCombinable<{
    ownerIds?: string[];
    ownerAliases?: string[];
    symbols?: string[];
    totalLotCount?: number | { gt: number } | { gte: number } | { lt: number } | { lte: number };
  }>;
  orderBy?: [
    (
      | 'lastChangedAt'
      | 'symbol'
      | 'totalLotCount'
      | 'totalQuantity'
      | 'totalPresentInvestedAmount'
      | 'totalRealizedAmount'
      | 'currentPortfolioPortion'
    ),
    'ASC' | 'DESC',
  ];
  pagination?: {
    offset?: number;
    limit?: number;
  };
  transaction?: Transaction;
}): Promise<HoldingStats[]> {
  const normParams = {
    filters: params.filters,
    pagination: {
      offset: params.pagination?.offset ?? 0,
      limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
    },
    orderBy: params.orderBy ?? ['lastChangedAt', 'DESC'],
    transaction: params.transaction,
  } satisfies typeof params;

  const positionModelFields = mapValues(PositionChangeModel.getAttributes(), atr => atr!.field);
  const tradeModelFields = mapValues(TradeRecordModel.getAttributes(), atr => atr!.field);
  const userModelFields = mapValues(UserModel.getAttributes(), atr => atr!.field);
  const portfolioCompositionModel = mapValues(
    PortfolioCompositionChangeModel.getAttributes(),
    atr => atr!.field
  );

  const holdingStatsChanges = await sequelize.query<HoldingStats>(
    `
      WITH
        latest_respective_holding_stats AS (
          SELECT
            DISTINCT ON ("${positionModelFields.ownerId}", "${positionModelFields.symbol}")
            *
          FROM
            "${pgSchemaName}"."${PositionChangeModel.tableName}"
          ORDER BY
            "${positionModelFields.ownerId}",
            "${positionModelFields.symbol}",
            "${positionModelFields.changedAt}" DESC
        )

      SELECT
        ${(
          [
            ['relatedTradeId', 'lastRelatedTradeId'],
            ['ownerId'],
            ['symbol'],
            ['totalLotCount'],
            ['totalQuantity'],
            ['totalPresentInvestedAmount'],
            ['totalRealizedAmount'],
            ['totalRealizedProfitOrLossAmount'],
            ['totalRealizedProfitOrLossRate'],
            ['changedAt', 'lastChangedAt'],
          ] as const
        )
          .map(
            ([keyName, alias]) => `hs."${positionModelFields[keyName]}" AS "${alias ?? keyName}",\n`
          )
          .join('')}
        hs."${positionModelFields.totalPresentInvestedAmount}" / NULLIF(hs."${positionModelFields.totalQuantity}", 0) AS "breakEvenPrice",
        pcc.${portfolioCompositionModel.portion} AS "currentPortfolioPortion"

      FROM
        latest_respective_holding_stats AS hs
        INNER JOIN "${pgSchemaName}"."${UserModel.tableName}" AS u ON
          hs."${positionModelFields.ownerId}" = u."${userModelFields.id}"
        LEFT JOIN "${pgSchemaName}"."${PortfolioCompositionChangeModel.tableName}" AS pcc ON
          pcc."${portfolioCompositionModel.relatedHoldingChangeId}" = (
            SELECT
              id
            FROM
              "${pgSchemaName}"."${TradeRecordModel.tableName}"
            WHERE
              "${tradeModelFields.ownerId}" = u."${userModelFields.id}"
            ORDER BY
              "${tradeModelFields.performedAt}" DESC
            LIMIT 1
          ) AND
          pcc."${portfolioCompositionModel.symbol}" = hs."${positionModelFields.symbol}"

      ${buildWhereClauseFromLogicCombinables(normParams.filters, {
        ownerIds: val =>
          !val.length ? '' : `u."${userModelFields.id}" IN (${sequelizeEscapeArray(val)})`,
        ownerAliases: val =>
          !val.length ? '' : `u."${userModelFields.alias}" IN (${sequelizeEscapeArray(val)})`,
        symbols: val =>
          !val.length ? '' : `hs."${positionModelFields.symbol}" IN (${sequelizeEscapeArray(val)})`,
        totalLotCount: val => {
          const colExp = `hs."${positionModelFields.totalLotCount}"`;
          if (typeof val === 'number') {
            return `${colExp} = ${sequelize.escape(val)}`;
          }
          if ('lt' in val) {
            return `${colExp} < ${sequelize.escape(val.lt)}`;
          }
          if ('lte' in val) {
            return `${colExp} <= ${sequelize.escape(val.lte)}`;
          }
          if ('gt' in val) {
            return `${colExp} > ${sequelize.escape(val.gt)}`;
          }
          if ('gte' in val) {
            return `${colExp} >= ${sequelize.escape(val.gte)}`;
          }
        },
      })}

      ORDER BY
        ${escapeDbCol(normParams.orderBy[0])} ${normParams.orderBy[1] === 'DESC' ? 'DESC' : 'ASC'}

      OFFSET :offset
      LIMIT :limit;
    `,
    {
      transaction: normParams.transaction,
      replacements: {
        offset: normParams.pagination.offset,
        limit: normParams.pagination.limit,
      },
      type: QueryTypes.SELECT,
    }
  );

  return holdingStatsChanges;
}

type HoldingStats = {
  lastRelatedTradeId: string;
  ownerId: string;
  symbol: string;
  totalLotCount: number;
  totalQuantity: number;
  totalPresentInvestedAmount: number;
  totalRealizedAmount: number;
  totalRealizedProfitOrLossAmount: number;
  totalRealizedProfitOrLossRate: number;
  currentPortfolioPortion: number;
  breakEvenPrice: number | null;
  lastChangedAt: Date;
};
