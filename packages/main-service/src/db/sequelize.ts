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

export { sequelize, initDbSchema };

const sequelize = new Sequelize(env.POSTGRES_DB_CONNECTION_URL, {
  logging: env.DB_LOGGING ? console.log : undefined,
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
  // await sequelize.authenticate();
  await sequelize.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  `);
  await sequelize.sync({
    alter: true,
    force: false,
  });
  await sequelize.query(` 
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_alias_idx"
      ON "${UserModel.tableName}" USING btree
      ("${UserModel.getAttributes().alias.field}");
  `);
  await sequelize.query(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "symbol_and_owner_id_idx"
      ON "${TradeRecordModel.tableName}" USING btree
      ("${TradeRecordModel.getAttributes().symbol.field}", "${TradeRecordModel.getAttributes().ownerId.field}");
  `);
}
