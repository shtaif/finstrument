import { QueryTypes, type Transaction } from 'sequelize';
import { mapValues } from 'lodash-es';
import {
  HoldingStatsChangeModel,
  PortfolioCompositionChangeModel,
  TradeRecordModel,
  UserModel,
  sequelize,
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
    totalPositionCount?:
      | number
      | { gt: number }
      | { gte: number }
      | { lt: number }
      | { lte: number };
  }>;
  orderBy?: [
    (
      | 'lastChangedAt'
      | 'symbol'
      | 'totalPositionCount'
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

  const holdingModelFields = mapValues(HoldingStatsChangeModel.getAttributes(), atr => atr!.field);
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
            DISTINCT ON ("${holdingModelFields.ownerId}", "${holdingModelFields.symbol}")
            *
          FROM
            "${HoldingStatsChangeModel.tableName}"
          ORDER BY
            "${holdingModelFields.ownerId}",
            "${holdingModelFields.symbol}",
            "${holdingModelFields.changedAt}" DESC
        )

      SELECT
        ${(
          [
            ['relatedTradeId', 'lastRelatedTradeId'],
            ['ownerId'],
            ['symbol'],
            ['totalPositionCount'],
            ['totalQuantity'],
            ['totalPresentInvestedAmount'],
            ['totalRealizedAmount'],
            ['totalRealizedProfitOrLossAmount'],
            ['totalRealizedProfitOrLossRate'],
            ['changedAt', 'lastChangedAt'],
          ] as const
        )
          .map(
            ([keyName, alias]) => `hs."${holdingModelFields[keyName]}" AS "${alias ?? keyName}",\n`
          )
          .join('')}
        hs."${holdingModelFields.totalPresentInvestedAmount}" / NULLIF(hs."${holdingModelFields.totalQuantity}", 0) AS "breakEvenPrice",
        pcc.${portfolioCompositionModel.portion} AS "currentPortfolioPortion"

      FROM
        latest_respective_holding_stats AS hs
        INNER JOIN "${UserModel.tableName}" AS u ON
          hs."${holdingModelFields.ownerId}" = u."${userModelFields.id}"
        LEFT JOIN "${PortfolioCompositionChangeModel.tableName}" AS pcc ON
          pcc."${portfolioCompositionModel.relatedHoldingChangeId}" = (
            SELECT
              id
            FROM
              "${TradeRecordModel.tableName}"
            WHERE
              "${tradeModelFields.ownerId}" = u."${userModelFields.id}"
            ORDER BY
              "${tradeModelFields.performedAt}" DESC
            LIMIT 1
          ) AND
          pcc."${portfolioCompositionModel.symbol}" = hs."${holdingModelFields.symbol}"

      ${buildWhereClauseFromLogicCombinables(normParams.filters, {
        ownerIds: val =>
          !val.length ? '' : `u."${userModelFields.id}" IN (${sequelizeEscapeArray(val)})`,
        ownerAliases: val =>
          !val.length ? '' : `u."${userModelFields.alias}" IN (${sequelizeEscapeArray(val)})`,
        symbols: val =>
          !val.length ? '' : `hs."${holdingModelFields.symbol}" IN (${sequelizeEscapeArray(val)})`,
        totalPositionCount: val => {
          const colExp = `hs."${holdingModelFields.totalPositionCount}"`;
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
  totalPositionCount: number;
  totalQuantity: number;
  totalPresentInvestedAmount: number;
  totalRealizedAmount: number;
  totalRealizedProfitOrLossAmount: number;
  totalRealizedProfitOrLossRate: number;
  currentPortfolioPortion: number;
  breakEvenPrice: number | null;
  lastChangedAt: Date;
};

// import {
//   retrieveHoldingStatsChanges,
//   type RetrieveHoldingStatsChangesParams,
// } from '../retrieveHoldingStatsChanges';

// export { retrieveHoldingStats, type HoldingStats };

// async function retrieveHoldingStats(params: {
//   filters: {
//     symbols?: string[];
//   } & (
//     | { ownerIds: string[]; ownerAliases?: undefined }
//     | { ownerIds?: undefined; ownerAliases: string[] }
//     | { ownerIds: string[]; ownerAliases: string[] }
//   );
//   pagination?: RetrieveHoldingStatsChangesParams['pagination'];
//   orderBy?: [
//     (
//       | Exclude<NonNullable<RetrieveHoldingStatsChangesParams['orderBy']>[0], 'changedAt'>
//       | 'lastChangedAt'
//     ),
//     'ASC' | 'DESC',
//   ];
// }): Promise<HoldingStats[]> {
//   const holdingStatsChanges = await retrieveHoldingStatsChanges({
//     filters: {
//       latestPerOwnerAndSymbol: true,
//       ...params.filters,
//     },
//     orderBy: !params.orderBy
//       ? undefined
//       : [
//           params.orderBy[0] === 'lastChangedAt' ? 'changedAt' : params.orderBy[0],
//           params.orderBy[1],
//         ],
//     pagination: params.pagination,
//   } satisfies RetrieveHoldingStatsChangesParams);

//   return holdingStatsChanges.map(
//     ({
//       relatedTradeId,
//       ownerId,
//       symbol,
//       totalPositionCount,
//       totalQuantity,
//       totalPresentInvestedAmount,
//       totalRealizedAmount,
//       portfolioPortion,
//       breakEvenPrice,
//       changedAt,
//     }) => ({
//       relatedTradeId,
//       ownerId,
//       symbol,
//       totalPositionCount,
//       totalQuantity,
//       totalPresentInvestedAmount,
//       totalRealizedAmount,
//       portfolioPortion,
//       breakEvenPrice,
//       lastChangedAt: changedAt,
//     })
//   );
// }

// type HoldingStats = {
//   ownerId: string;
//   relatedTradeId: string;
//   symbol: string;
//   totalPositionCount: number;
//   totalQuantity: number;
//   totalPresentInvestedAmount: number;
//   totalRealizedAmount: number;
//   portfolioPortion: number;
//   breakEvenPrice: number;
//   lastChangedAt: Date;
// };
