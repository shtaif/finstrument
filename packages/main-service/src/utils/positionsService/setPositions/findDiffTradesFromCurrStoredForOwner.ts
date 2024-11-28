import { QueryTypes, Transaction } from 'sequelize';
import { pgSchemaName, sequelize, TradeRecordModel } from '../../../db/index.js';

export { findDiffTradesFromCurrStoredForOwner, type MissingTradeInfo };

async function findDiffTradesFromCurrStoredForOwner(params: {
  ownerId: string;
  tradeRecords: {
    symbol: string;
    quantity: number;
    price: number;
    performedAt: Date;
  }[];
  transaction?: Transaction;
}): Promise<MissingTradeInfo[]> {
  const { ownerId, tradeRecords, transaction } = params;

  const missingTradesFromStored = !tradeRecords.length
    ? []
    : await sequelize.query<MissingTradeInfo>(
        `
          WITH
            trades_to_check_with_dup_counts AS (
              SELECT
                *,
                COUNT(*)::int AS "occurrence_count"
              FROM
                (
                  VALUES ${tradeRecords
                    .map(
                      ({ symbol, quantity, price, performedAt }) =>
                        `(
                          ${sequelize.escape(symbol)},
                          ${sequelize.escape(quantity)},
                          ${sequelize.escape(price)},
                          TO_TIMESTAMP(${sequelize.escape(+performedAt / 1000)})
                        )`
                    )
                    .join(',\n')}
                ) AS values(
                  symbol,
                  quantity,
                  price,
                  performed_at
                )
              GROUP BY
                symbol,
                quantity,
                price,
                performed_at
            ),

            existing_trades_with_dup_counts AS (
              SELECT
                symbol,
                quantity,
                price,
                performed_at,
                COUNT(*)::int AS occurrence_count
              FROM
                "${pgSchemaName}"."${TradeRecordModel.tableName}"
              WHERE
                "owner_id" = ${sequelize.escape(ownerId)}
              GROUP BY
                symbol,
                quantity,
                price,
                performed_at
            )

          SELECT
            new_t.symbol AS symbol,
            new_t.quantity AS quantity,
            new_t.price::float AS price,
            new_t.performed_at AS "performedAt",
            (  
              CASE
                WHEN (exs_t.symbol IS NULL AND exs_t.performed_at IS NULL) THEN
                  'NEW'
                ELSE
                  'MODIFICATION'
              END
            ) AS "isNewOrModified",
            COALESCE(exs_t.occurrence_count, 0) AS "existingCount",
            new_t.occurrence_count AS "newCount"
          FROM
            trades_to_check_with_dup_counts AS new_t
            LEFT OUTER JOIN existing_trades_with_dup_counts AS exs_t
              ON
                exs_t.symbol = new_t.symbol AND
                exs_t.performed_at = new_t.performed_at
          WHERE
            (
              exs_t.symbol IS NULL AND
              exs_t.performed_at IS NULL
            ) OR
            NOT (
              exs_t.symbol = new_t.symbol AND
              exs_t.performed_at = new_t.performed_at AND
              exs_t.quantity = new_t.quantity AND
              exs_t.price = new_t.price
            );
        `,
        {
          transaction,
          type: QueryTypes.SELECT,
        }
      );

  return missingTradesFromStored;
}

type MissingTradeInfo = {
  symbol: string;
  quantity: number;
  price: number;
  performedAt: Date;
  isNewOrModified: 'NEW' | 'MODIFIED';
  existingCount: number;
  newCount: number;
};
