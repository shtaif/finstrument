import { type BelongsToOptions, type HasManyOptions, type InferAttributes } from 'sequelize';
import {
  Sequelize,
  Model,
  DataType,
  Table,
  Column,
  HasMany,
  BelongsTo,
} from 'sequelize-typescript';
import { UserModel } from './UserModel.js';
import { TradeRecordModel } from './TradeRecordModel.js';
import { PositionClosingModel } from './PositionClosingModel.js';

export { PositionModel, type PositionModelAttributes, type PositionModelCreationAttributes };

// TODO: create composite indices for (owner_id + performed_at), (owner_id + symbol), (owner_id + action_type)
@Table({
  tableName: 'positions',
  timestamps: true,
  createdAt: 'recordCreatedAt',
  updatedAt: 'recordUpdatedAt',
  defaultScope: {},
})
class PositionModel extends Model<PositionModelAttributes, PositionModelCreationAttributes> {
  @Column({
    field: 'id',
    type: DataType.UUID,
    defaultValue: Sequelize.literal('gen_random_uuid()'),
    allowNull: false,
    primaryKey: true,
  })
  id!: string;

  @Column({
    field: 'owner_id',
    type: DataType.UUID,
    allowNull: false,
  })
  ownerId!: string;

  @Column({
    field: 'opening_trade_id',
    type: DataType.UUID,
    allowNull: false,
  })
  openingTradeId!: string;

  @Column({
    field: 'symbol',
    type: DataType.STRING(16),
    allowNull: false,
  })
  symbol!: string;

  @Column({
    field: 'remaining_quantity',
    type: DataType.INTEGER,
    allowNull: false,
  })
  remainingQuantity!: number;

  @Column({
    field: 'realized_profit_or_loss',
    type: DataType.FLOAT,
    allowNull: false,
  })
  realizedProfitOrLoss!: number;

  @Column({
    field: 'opened_at',
    type: DataType.DATE,
    allowNull: false,
  })
  openedAt!: Date;

  @Column({
    field: 'record_created_at',
    type: DataType.DATE,
    allowNull: false,
  })
  declare recordCreatedAt: Date;

  @Column({
    field: 'record_updated_at',
    type: DataType.DATE,
    allowNull: false,
  })
  declare recordUpdatedAt: Date;

  @BelongsTo(() => UserModel, {
    targetKey: 'id',
    foreignKey: 'ownerId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  owner!: Self<UserModel>;

  @BelongsTo(() => TradeRecordModel, {
    targetKey: 'id',
    foreignKey: 'openingTradeId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  openingTrade!: Self<TradeRecordModel>;

  @HasMany(() => PositionClosingModel, {
    sourceKey: 'id',
    foreignKey: 'positionId',
    onDelete: 'CASCADE',
  } satisfies HasManyOptions)
  positionClosings!: Self<PositionClosingModel>[];
}

type PositionModelAttributes = InferAttributes<PositionModel>;

type PositionModelCreationAttributes = {
  id?: PositionModel['id'];
  ownerId: PositionModel['ownerId'];
  openingTradeId: PositionModel['openingTradeId'];
  symbol: PositionModel['symbol'];
  remainingQuantity: PositionModel['remainingQuantity'];
  realizedProfitOrLoss: PositionModel['realizedProfitOrLoss'];
  openedAt: Date | string | number;
  recordCreatedAt?: Date | string | number;
  recordUpdatedAt?: Date | string | number;
};

type Self<T> = T;
