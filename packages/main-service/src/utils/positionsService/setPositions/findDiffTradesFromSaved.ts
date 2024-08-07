import { QueryTypes, Transaction } from 'sequelize';
import { sequelize, pgSchemaName, TradeRecordModel } from '../../../db/index.js';

export { findDiffTradesFromSaved, type MissingTradeInfo };

async function findDiffTradesFromSaved(params: {
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
            COALESCE(ext_t.occurrence_count, 0) AS "existingCount",
            new_t.occurrence_count AS "newCount"
          FROM
            trades_to_check_with_dup_counts AS new_t
            LEFT JOIN existing_trades_with_dup_counts AS ext_t
              ON
                ext_t.symbol = new_t.symbol AND
                ext_t.performed_at = new_t.performed_at
          WHERE
            (
              ext_t.symbol IS NULL AND
              ext_t.performed_at IS NULL
            ) OR
            ext_t.occurrence_count < new_t.occurrence_count;
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
  existingCount: number;
  newCount: number;
};
