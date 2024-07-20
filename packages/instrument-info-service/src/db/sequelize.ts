import { Sequelize } from 'sequelize-typescript';
import { env } from '../utils/env';
import { InstrumentInfoModel } from './models/InstrumentInfoModel';

export { sequelize };

const sequelize = new Sequelize(env.POSTGRES_DB_CONNECTION_URL, {
  logging: env.DB_LOGGING ? console.log : undefined,
  dialect: 'postgres',
  pool: {},
  models: [InstrumentInfoModel],
});
