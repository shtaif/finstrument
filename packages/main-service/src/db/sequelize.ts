import { Sequelize } from 'sequelize-typescript';
import { env } from '../utils/env.js';
import { UserModel } from './models/UserModel.js';
import { TradeRecordModel } from './models/TradeRecordModel.js';
import { InstrumentInfoModel } from './models/InstrumentInfoModel.js';
import { LotModel } from './models/LotModel.js';
import { LotClosingModel } from './models/LotClosingModel.js';
import { PositionChangeModel } from './models/PositionChangeModel.js';
import { CurrencyStatsChangeModel } from './models/CurrencyStatsChangeModel.js';
import { PortfolioCompositionChangeModel } from './models/PortfolioCompositionChangeModel.js';

export { sequelize, initDbSchema, pgSchemaName };

const dbUrl = (() => {
  const url = new URL(env.POSTGRES_DB_CONNECTION_URL);
  console.log('___env___', env);
  if (env.RENDER && !url.searchParams.has('ssl')) {
    url.searchParams.set('ssl', 'true'); // For some reason, not including `?ssl=true` with the conn string when it points to render.com's DB fails to connect with a "Error: The server does not support SSL connections"
  }
  return url;
})();

const pgSchemaName = dbUrl.searchParams.get('schema') ?? 'public';

const sequelize = new Sequelize(dbUrl.toString(), {
  logging: env.DB_LOGGING ? console.log : undefined,
  schema: pgSchemaName,
  dialect: 'postgres',
  ssl: true,
  pool: {},
  models: [
    UserModel,
    TradeRecordModel,
    InstrumentInfoModel,
    LotModel,
    LotClosingModel,
    PositionChangeModel,
    CurrencyStatsChangeModel,
    PortfolioCompositionChangeModel,
  ],
});

async function initDbSchema(): Promise<void> {
  if (pgSchemaName !== 'public') {
    await sequelize.query(`
      CREATE SCHEMA IF NOT EXISTS "${pgSchemaName}";
    `);
  }

  if (env.SYNC_SEQUELIZE_MODELS) {
    await sequelize.sync({
      alter: true,
      force: false,
    });
  }

  if (pgSchemaName !== 'public') {
    /*
      There's a bug in all versions of `sequelize@^6` with a Postgres DB in which whenever running
      `sequelize.sync`, having configured Sequelize with some custom schema (other then the "public"
      default one) - every call to `sequelize.sync` will create duplicate foreign key constraints, every
      time. They will not crush queries probably, but gradually degrade their performance in a very
      noticable way. Following is a workaround that tries to remove the duplicate foreign keys, targeting
      them by the automatic numeric suffix they get added to their name.

      Sequelize PR that explains and fixes this only for `sequelize@^7` versions: https://github.com/sequelize/sequelize/pull/14570
    */
    await sequelize.query(`
      DO
        $$
          declare r record;
          BEGIN
            FOR r IN (
              SELECT
                tc.constraint_name,
                tc.table_name
              FROM
                information_schema.table_constraints AS tc
              WHERE
                tc.constraint_type = 'FOREIGN KEY' AND
                tc.table_schema = '${pgSchemaName}' AND
                tc.constraint_name LIKE '%_fkey_%'
            ) loop
              EXECUTE
                CONCAT(
                  'ALTER TABLE "${pgSchemaName}"."' || r.table_name || '" DROP CONSTRAINT ' || r.constraint_name
                );
            END loop;
          END;
        $$;
    `);
  }

  await sequelize.query(` 
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_alias_idx"
      ON "${pgSchemaName}"."${UserModel.tableName}" USING btree
      ("${UserModel.getAttributes().alias.field}");
  `);

  await sequelize.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "symbol_and_owner_id_idx"
      ON "${pgSchemaName}"."${TradeRecordModel.tableName}" USING btree
      ("${TradeRecordModel.getAttributes().symbol.field}", "${TradeRecordModel.getAttributes().ownerId.field}");
  `);
}
