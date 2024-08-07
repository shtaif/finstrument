import { Sequelize } from 'sequelize-typescript';
import { env } from '../utils/env.js';
import { UserModel } from './models/UserModel.js';
import { TradeRecordModel } from './models/TradeRecordModel.js';
import { InstrumentInfoModel } from './models/InstrumentInfoModel.js';
import { PositionModel } from './models/PositionModel.js';
import { PositionClosingModel } from './models/PositionClosingModel.js';
import { HoldingStatsChangeModel } from './models/HoldingStatsChangeModel.js';
import { PortfolioStatsChangeModel } from './models/PortfolioStatsChangeModel.js';
import { PortfolioCompositionChangeModel } from './models/PortfolioCompositionChangeModel.js';

export { sequelize, initDbSchema, pgSchemaName };

const pgSchemaName = new URL(env.POSTGRES_DB_CONNECTION_URL).searchParams.get('schema') ?? 'public';

const sequelize = new Sequelize(env.POSTGRES_DB_CONNECTION_URL, {
  logging: env.DB_LOGGING ? console.log : undefined,
  schema: pgSchemaName,
  dialect: 'postgres',
  pool: {},
  models: [
    UserModel,
    TradeRecordModel,
    InstrumentInfoModel,
    PositionModel,
    PositionClosingModel,
    HoldingStatsChangeModel,
    PortfolioStatsChangeModel,
    PortfolioCompositionChangeModel,
  ],
});

async function initDbSchema(): Promise<void> {
  await sequelize.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  `);

  if (pgSchemaName !== 'public') {
    await sequelize.query(`
      CREATE SCHEMA IF NOT EXISTS "${pgSchemaName}";
    `);
  }

  await sequelize.sync({
    alter: true,
    force: false,
  });

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
