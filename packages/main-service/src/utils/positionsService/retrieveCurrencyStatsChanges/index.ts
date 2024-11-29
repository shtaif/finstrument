import { Op, QueryTypes, type Transaction } from 'sequelize';
import { mapValues } from 'lodash-es';
import {
  sequelize,
  pgSchemaName,
  CurrencyStatsChangeModel,
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
  retrieveCurrencyStatsChanges,
  type RetrieveCurrencyStatsChangesParams,
  type CurrencyStatsChange,
};

async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<false, false>
): Promise<CurrencyStatsChange<false, false>[]>;
async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<true, false>
): Promise<CurrencyStatsChange<true, false>[]>;
async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<false, true>
): Promise<CurrencyStatsChange<false, true>[]>;
async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<true, true>
): Promise<CurrencyStatsChange<true, true>[]>;
async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<boolean, boolean>
): Promise<CurrencyStatsChange<boolean, boolean>[]>;
async function retrieveCurrencyStatsChanges(
  params: RetrieveCurrencyStatsChangesParams<boolean, boolean>
): Promise<CurrencyStatsChange<boolean, boolean>[]> {
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
    CurrencyStatsChangeModel.getAttributes(),
    atr => atr!.field
  );
  const userModelFields = mapValues(UserModel.getAttributes(), atr => atr!.field);
  const portfolioCompositionModelFields = mapValues(
    PortfolioCompositionChangeModel.getAttributes(),
    atr => atr!.field
  );

  const currencyStats = await sequelize.query<CurrencyStatsChange<boolean>>(
    `
      WITH portfolio_stats_base AS (
        ${(() => {
          const latestRespectivePortfolioStats = `
            SELECT
              DISTINCT ON ("${portfolioModelFields.ownerId}", "${portfolioModelFields.forCurrency}")
              *
            FROM
              "${pgSchemaName}"."${CurrencyStatsChangeModel.tableName}"
            ORDER BY
              "${portfolioModelFields.ownerId}",
              "${portfolioModelFields.forCurrency}",
              "${portfolioModelFields.changedAt}" DESC
          `;
          const regularPortfolioStats = `SELECT * FROM "${pgSchemaName}"."${CurrencyStatsChangeModel.tableName}"`;
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
        -- ,(SELECT JSONB_AGG(_.*) FROM "${pgSchemaName}"."${PortfolioCompositionChangeModel.tableName}" AS _ GROUP BY _.symbol) AS "___1"
      FROM
        portfolio_stats_base AS psb
        INNER JOIN "${pgSchemaName}"."${UserModel.tableName}" AS u ON
          psb."${portfolioModelFields.ownerId}" = u."${userModelFields.id}"
        -- -- --
        -- -- --
        -- INNER JOIN "${pgSchemaName}"."${PortfolioCompositionChangeModel.tableName}" AS pcc ON
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

  if (!normParams.includeCompositions) {
    return currencyStats;
  }

  const relatedTradeIds = currencyStats.map(({ relatedTradeId }) => relatedTradeId);

  const compositionChanges = await PortfolioCompositionChangeModel.findAll({
    where: {
      relatedHoldingChangeId: {
        [Op.in]: relatedTradeIds,
      },
    },
  });

  return currencyStats.map(currencyStats => ({
    ...currencyStats,
    composition: compositionChanges
      .filter(comp => comp.relatedHoldingChangeId === currencyStats.relatedTradeId)
      .map(({ symbol, portion }) => ({ symbol, portion })),
  }));
}

type RetrieveCurrencyStatsChangesParams<
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

type CurrencyStatsChange<
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
