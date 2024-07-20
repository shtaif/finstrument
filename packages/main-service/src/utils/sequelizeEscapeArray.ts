import { sequelize } from '../db/index.js';

export { sequelizeEscapeArray };

function sequelizeEscapeArray(array: readonly SequelizeEscapeInput[]): string {
  return array.map(value => sequelize.escape(value)).join(', ');
}

type SequelizeEscapeInput = Parameters<typeof sequelize.escape>[0];
