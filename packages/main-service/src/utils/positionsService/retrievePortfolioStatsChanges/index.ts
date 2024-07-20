import { Op, QueryTypes, type Transaction } from 'sequelize';
import { mapValues } from 'lodash';
import {
  sequelize,
  PortfolioStatsChangeModel,
  UserModel,
  PortfolioCompositionChangeModel,
} from '../../../db/index.js';
import { escapeDbCol } from '../../escapeDbCol.js';
import {
  buildWhereClauseFromLogicCombinables,
  type LogicCombinable,
} from '../../buildWhereClauseFromLogicCombinables.js';
import { sequelizeEscapeArray } from '../../sequelizeEscapeArray.js';

export {
  retrievePortfolioStatsChanges,
  type RetrievePortfolioStatsChangesParams,
  type PortfolioStatsChange,
};

async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<false, false>
): Promise<PortfolioStatsChange<false, false>[]>;
async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<true, false>
): Promise<PortfolioStatsChange<true, false>[]>;
async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<false, true>
): Promise<PortfolioStatsChange<false, true>[]>;
async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<true, true>
): Promise<PortfolioStatsChange<true, true>[]>;
async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<boolean, boolean>
): Promise<PortfolioStatsChange<boolean, boolean>[]>;
async function retrievePortfolioStatsChanges(
  params: RetrievePortfolioStatsChangesParams<boolean, boolean>
): Promise<PortfolioStatsChange<boolean, boolean>[]> {
  const normParams = {
    filters: params.filters,
    orderBy: params.orderBy ?? [params.latestPerOwner ? 'lastChangedAt' : 'changedAt', 'DESC'],
    pagination: {
      offset: params.pagination?.offset ?? 0,
      limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
    },
    latestPerOwner: params.latestPerOwner,
    includeCompositions: params.includeCompositions ?? false,
    transaction: params.transaction,
  } satisfies typeof params;

  const portfolioModelFields = mapValues(
    PortfolioStatsChangeModel.getAttributes(),
    atr => atr!.field
  );
  const userModelFields = mapValues(UserModel.getAttributes(), atr => atr!.field);
  const portfolioCompositionModelFields = mapValues(
    PortfolioCompositionChangeModel.getAttributes(),
    atr => atr!.field
  );

  const portfolioStats = await sequelize.query<PortfolioStatsChange<boolean>>(
    `
      WITH portfolio_stats_base AS (
        ${(() => {
          const latestRespectivePortfolioStats = `
            SELECT
              DISTINCT ON ("${portfolioModelFields.ownerId}", "${portfolioModelFields.forCurrency}")
              *
            FROM
              "${PortfolioStatsChangeModel.tableName}"
            ORDER BY
              "${portfolioModelFields.ownerId}",
              "${portfolioModelFields.forCurrency}",
              "${portfolioModelFields.changedAt}" DESC
          `;
          const regularPortfolioStats = `SELECT * FROM "${PortfolioStatsChangeModel.tableName}"`;
          return normParams.latestPerOwner ? latestRespectivePortfolioStats : regularPortfolioStats;
        })()}
      )

      SELECT
        ${(
          [
            ['relatedTradeId'],
            ['ownerId'],
            ['forCurrency'],
            ['totalPresentInvestedAmount'],
            ['totalRealizedAmount'],
            ['totalRealizedProfitOrLossAmount'],
            ['totalRealizedProfitOrLossRate'],
            ['changedAt', normParams.latestPerOwner ? 'lastChangedAt' : 'changedAt'],
          ] as const
        )
          .map(
            ([keyName, alias]) => `psb."${portfolioModelFields[keyName]}" AS "${alias ?? keyName}"`
          )
          .join(',\n')}
        -- ,(SELECT * FROM JSONB_AGG(pcc)) AS "___1"
        -- ,(SELECT JSONB_AGG(_.*) FROM "${PortfolioCompositionChangeModel.tableName}" AS _ GROUP BY _.symbol) AS "___1"
      FROM
        portfolio_stats_base AS psb
        INNER JOIN "${UserModel.tableName}" AS u ON
          psb."${portfolioModelFields.ownerId}" = u."${userModelFields.id}"
        -- -- --
        -- -- --
        -- INNER JOIN "${PortfolioCompositionChangeModel.tableName}" AS pcc ON
        --   psb."${portfolioModelFields.relatedTradeId}" = pcc."${portfolioCompositionModelFields.relatedHoldingChangeId}"
        -- -- --
        -- -- --

      ${buildWhereClauseFromLogicCombinables(normParams.filters, {
        ownerIds: val =>
          !val.length ? '' : `u."${userModelFields.id}" IN (${sequelizeEscapeArray(val)})`,
        ownerAliases: val =>
          !val.length ? '' : `u."${userModelFields.alias}" IN (${sequelizeEscapeArray(val)})`,
        forCurrencies: val => {
          const stringItems = val.filter((item): item is string => item !== null);
          const containedNullVal = stringItems.length < val.length;
          return [
            containedNullVal && `psb.${portfolioModelFields.forCurrency} IS NULL`,
            !!stringItems.length &&
              `psb.${portfolioModelFields.forCurrency} IN (${sequelizeEscapeArray(stringItems)})`,
          ]
            .filter(Boolean)
            .join(' OR ');
        },
        relatedTradeIds: val =>
          `psb."${portfolioModelFields.relatedTradeId}" IN (${sequelizeEscapeArray(val)})`,
        changedAtDates: val =>
          `psb."${portfolioModelFields.changedAt}" IN (${sequelizeEscapeArray(val)})`,
        totalPresentInvestedAmount: val => {
          let condition = `psb."${portfolioModelFields.totalPresentInvestedAmount}" `;
          if (typeof val === 'number') {
            condition += ` = ${val}`;
          } else {
            if (Object.values(val)[0] === undefined) {
              return;
            }
            const op = Object.keys(val)[0];
            if ((val as any)[op] === undefined) {
              return;
            }
            if ('eq' in val && val.eq) {
              condition += ` = ${val.eq}`;
            } else if ('neq' in val && val.neq) {
              condition += ` = ${val.neq}`;
            } else if ('gt' in val && val.gt) {
              condition += ` = ${val.gt}`;
            } else if ('gte' in val && val.gte) {
              condition += ` = ${val.gte}`;
            } else if ('lt' in val && val.lt) {
              condition += ` = ${val.lt}`;
            } else if ('lte' in val && val.lte) {
              condition += ` = ${val.lte}`;
            }
            return condition;
          }
        },
      })}
          
      ORDER BY
        ${escapeDbCol(normParams.orderBy[0])} ${normParams.orderBy[1] === 'DESC' ? 'DESC' : 'ASC'}

      OFFSET :offset
      LIMIT :limit;
    `,
    {
      transaction: params.transaction,
      replacements: {
        offset: normParams.pagination.offset,
        limit: normParams.pagination.limit,
      },
      type: QueryTypes.SELECT,
    }
  );

  // console.log('portfolioStats', portfolioStats);

  if (!normParams.includeCompositions) {
    return portfolioStats;
  }

  const relatedTradeIds = portfolioStats.map(({ relatedTradeId }) => relatedTradeId);

  const compositionChanges = await PortfolioCompositionChangeModel.findAll({
    where: {
      relatedHoldingChangeId: {
        [Op.in]: relatedTradeIds,
      },
    },
  });

  return portfolioStats.map(portfolioStats => ({
    ...portfolioStats,
    composition: compositionChanges
      .filter(comp => comp.relatedHoldingChangeId === portfolioStats.relatedTradeId)
      .map(({ symbol, portion }) => ({ symbol, portion })),
  }));
}

type RetrievePortfolioStatsChangesParams<
  TLatestPerOwner extends boolean = false,
  TIncludeCompositions extends boolean = false,
> = {
  filters: LogicCombinable<{
    ownerIds?: readonly string[];
    ownerAliases?: readonly string[];
    forCurrencies?: readonly (string | null)[];
    relatedTradeIds?: readonly string[];
    changedAtDates?: readonly (Date | string | number)[];
    totalPresentInvestedAmount?: NumberOperators;
  }>;
  pagination?: {
    offset?: number;
    limit?: number;
  };
  orderBy?: [
    (
      | (TLatestPerOwner extends true ? 'lastChangedAt' : 'changedAt')
      | 'totalPresentInvestedAmount'
      | 'totalRealizedAmount'
      | 'totalRealizedProfitOrLossAmount'
      | 'totalRealizedProfitOrLossRate'
    ),
    'ASC' | 'DESC',
  ];
  transaction?: Transaction;
} & (TLatestPerOwner extends true ? { latestPerOwner: true } : { latestPerOwner?: false }) &
  (TIncludeCompositions extends true
    ? { includeCompositions: true }
    : { includeCompositions?: false });

type PortfolioStatsChange<
  TLatestPerOwner extends boolean = false,
  TIncludeComposition extends boolean = false,
> = {
  relatedTradeId: string;
  ownerId: string;
  forCurrency: string | null;
  totalPresentInvestedAmount: number;
  totalRealizedAmount: number;
  totalRealizedProfitOrLossAmount: number;
  totalRealizedProfitOrLossRate: number;
} & (TLatestPerOwner extends true ? { lastChangedAt: Date } : { changedAt: Date }) &
  (TIncludeComposition extends true
    ? {
        composition: {
          symbol: string;
          portion: number;
        }[];
      }
    : {});

type NumberOperators =
  | number
  | { eq?: number | undefined }
  | { neq?: number | undefined }
  | { gt?: number | undefined }
  | { gte?: number | undefined }
  | { lt?: number | undefined }
  | { lte?: number | undefined };

// **************************************************************************************************************
// **************************************************************************************************************
// **************************************************************************************************************

// import { Op, QueryTypes } from 'sequelize';
// import { mapValues } from 'lodash';
// import { escapeDbCol } from '../../escapeDbCol';
// import {
//   sequelize,
//   PortfolioStatsChangeModel,
//   UserModel,
//   PortfolioCompositionChangeModel,
// } from '../../../db/index.js';

// export {
//   retrievePortfolioStatsChanges,
//   type RetrievePortfolioStatsChangesParams,
//   type PortfolioStatsChange,
// };

// type RetrievePortfolioStatsChangesParams<TLatestPerOwner extends boolean = false> = {
//   filters: (TLatestPerOwner extends true
//     ? {
//         latestPerOwner: true;
//       }
//     : {
//         latestPerOwner?: false;
//       }) &
//     (
//       | { ownerIds: string[]; ownerAliases?: undefined }
//       | { ownerIds?: undefined; ownerAliases: string[] }
//       | { ownerIds: string[]; ownerAliases: string[] }
//     );
//   pagination?: {
//     offset?: number;
//     limit?: number;
//   };
//   orderBy?: [
//     (TLatestPerOwner extends true ? 'lastChangedAt' : 'changedAt') | 'totalPresentInvestedAmount',
//     'ASC' | 'DESC',
//   ];
// };

// async function retrievePortfolioStatsChanges(
//   params: RetrievePortfolioStatsChangesParams<false>
// ): Promise<PortfolioStatsChange<false>[]>;
// async function retrievePortfolioStatsChanges(
//   params: RetrievePortfolioStatsChangesParams<true>
// ): Promise<PortfolioStatsChange<true>[]>;
// async function retrievePortfolioStatsChanges(
//   params: RetrievePortfolioStatsChangesParams<boolean>
// ): Promise<PortfolioStatsChange<boolean>[]> {
//   const normParams = {
//     filters: {
//       latestPerOwner: params.filters.latestPerOwner ?? false,
//       ownerIds: params.filters.ownerIds ?? [],
//       ownerAliases: params.filters.ownerAliases ?? [],
//     },
//     orderBy: params.orderBy ?? [
//       params.filters.latestPerOwner ? 'lastChangedAt' : 'changedAt',
//       'DESC',
//     ],
//     pagination: {
//       offset: params.pagination?.offset ?? 0,
//       limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
//     },
//   } satisfies typeof params;

//   if (normParams.filters.ownerAliases.length === 0 && normParams.filters.ownerIds.length === 0) {
//     return [];
//   }

//   const portfolioModelFields = mapValues(
//     PortfolioStatsChangeModel.getAttributes(),
//     atr => atr!.field
//   );
//   const userModelFields = mapValues(UserModel.getAttributes(), atr => atr!.field);
//   const portfolioCompositionModelFields = mapValues(
//     PortfolioCompositionChangeModel.getAttributes(),
//     atr => atr!.field
//   );

//   const portfolioStats = await sequelize.query<PortfolioStatsChange<boolean>>(
//     `
//       WITH portfolio_stats_base AS (
//         ${(() => {
//           const latestRespectivePortfolioStats = `
//             SELECT
//               DISTINCT ON ("${portfolioModelFields.ownerId}")
//               *
//             FROM
//               "${PortfolioStatsChangeModel.tableName}"
//             ORDER BY
//               "${portfolioModelFields.ownerId}",
//               "${portfolioModelFields.changedAt}" DESC
//           `;
//           const regularPortfolioStats = `SELECT * FROM "${PortfolioStatsChangeModel.tableName}"`;
//           return normParams.filters.latestPerOwner
//             ? latestRespectivePortfolioStats
//             : regularPortfolioStats;
//         })()}
//       )

//       SELECT
//         psb."${portfolioModelFields.relatedTradeId}" AS "relatedTradeId",
//         psb."${portfolioModelFields.ownerId}" AS "ownerId",
//         psb."${portfolioModelFields.totalPresentInvestedAmount}" AS "totalPresentInvestedAmount",
//         psb."${portfolioModelFields.totalRealizedAmount}" AS "totalRealizedAmount",
//         psb."${portfolioModelFields.changedAt}" AS "${normParams.filters.latestPerOwner ? 'lastChangedAt' : 'changedAt'}"
//         -- ,(SELECT * FROM JSONB_AGG(pcc)) AS "___1"
//         -- ,(SELECT JSONB_AGG(_.*) FROM "${PortfolioCompositionChangeModel.tableName}" AS _ GROUP BY _.symbol) AS "___1"
//       FROM
//         portfolio_stats_base AS psb
//         INNER JOIN "${UserModel.tableName}" AS u ON
//           psb."${portfolioModelFields.ownerId}" = u."${userModelFields.id}"
//         -- -- --
//         -- -- --
//         INNER JOIN "${PortfolioCompositionChangeModel.tableName}" AS pcc ON
//           psb."${portfolioModelFields.relatedTradeId}" = pcc."${portfolioCompositionModelFields.relatedHoldingChangeId}"
//         -- -- --
//         -- -- --
//       WHERE
//         ${[
//           normParams.filters.ownerIds.length && `u."${userModelFields.id}" IN (:ownerIds)`,
//           normParams.filters.ownerAliases.length &&
//             `u."${userModelFields.alias}" IN (:ownerAliases)`,
//         ]
//           .filter(Boolean)
//           .join(' OR\n')}
//       ORDER BY
//         ${escapeDbCol(normParams.orderBy[0])} ${normParams.orderBy[1] === 'DESC' ? 'DESC' : 'ASC'}
//       OFFSET :offset
//       LIMIT :limit;
//     `,
//     {
//       replacements: {
//         ownerIds: normParams.filters.ownerIds,
//         ownerAliases: normParams.filters.ownerAliases,
//         offset: normParams.pagination.offset,
//         limit: normParams.pagination.limit,
//       },
//       type: QueryTypes.SELECT,
//     }
//   );

//   // return portfolioStats;

//   const relatedTradeIds = portfolioStats.map(({ relatedTradeId }) => relatedTradeId);

//   const compositionChanges = await PortfolioCompositionChangeModel.findAll({
//     where: {
//       relatedHoldingChangeId: {
//         [Op.in]: relatedTradeIds,
//       },
//     },
//   });

//   return portfolioStats.map(portfolioStats => ({
//     ...portfolioStats,
//     composition: compositionChanges
//       .filter(comp => comp.relatedHoldingChangeId === portfolioStats.relatedTradeId)
//       .map(({ symbol, portion }) => ({ symbol, portion })),
//   }));
// }

// type PortfolioStatsChange<TLatestPerOwner extends boolean = false> = {
//   ownerId: string;
//   relatedTradeId: string;
//   totalPresentInvestedAmount: number;
//   totalRealizedAmount: number;
// } & (TLatestPerOwner extends true
//   ? {
//       lastChangedAt: Date;
//     }
//   : {
//       changedAt: Date;
//     });

// type PortfolioStatsChange2<
//   TLatestPerOwner extends boolean = false,
//   TWithComposition extends boolean = false,
// > = {
//   ownerId: string;
//   relatedTradeId: string;
//   totalPresentInvestedAmount: number;
//   totalRealizedAmount: number;
// } & (TLatestPerOwner extends true
//   ? {
//       lastChangedAt: Date;
//     }
//   : {
//         changedAt: Date;
//       } & TWithComposition extends true
//     ? {
//         composition: {
//           symbol: string;
//           portion: number;
//         }[];
//       }
//     : object);
