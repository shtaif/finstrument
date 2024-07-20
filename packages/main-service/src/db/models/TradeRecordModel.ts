import { type HasOneOptions, type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Sequelize, Model, DataType, Table, Column, BelongsTo, HasOne } from 'sequelize-typescript';
import { UserModel } from './UserModel.js';
import { HoldingStatsChangeModel } from './HoldingStatsChangeModel.js';

export {
  TradeRecordModel,
  type TradeRecordModelAttributes,
  type TradeRecordModelCreationAttributes,
};

// TODO: create composite indices for (owner_id + performed_at), (owner_id + symbol), (owner_id + action_type)
@Table({
  tableName: 'trade_records',
  timestamps: true,
  createdAt: 'recordCreatedAt',
  updatedAt: 'recordUpdatedAt',
  defaultScope: {},
})
class TradeRecordModel extends Model<
  TradeRecordModelAttributes,
  TradeRecordModelCreationAttributes
> {
  @Column({
    field: 'id',
    type: DataType.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
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
    field: 'symbol',
    type: DataType.STRING(16),
    allowNull: false,
  })
  symbol!: string;

  @Column({
    field: 'quantity',
    type: DataType.INTEGER,
    allowNull: false,
  })
  quantity!: number;

  @Column({
    field: 'price',
    type: DataType.FLOAT,
    allowNull: false,
  })
  price!: number;

  @Column({
    field: 'performed_at',
    type: DataType.DATE,
    allowNull: false,
  })
  performedAt!: Date;

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

  @HasOne(() => HoldingStatsChangeModel, {
    foreignKey: 'relatedTradeId',
  } satisfies HasOneOptions)
  holdingChangeCaused!: Self<HoldingStatsChangeModel>;
}

type TradeRecordModelAttributes = InferAttributes<TradeRecordModel>;

type TradeRecordModelCreationAttributes = {
  id?: TradeRecordModel['id'];
  ownerId: TradeRecordModel['ownerId'];
  symbol: TradeRecordModel['symbol'];
  quantity: TradeRecordModel['quantity'];
  price: TradeRecordModel['price'];
  performedAt: Date | string | number;
  recordCreatedAt?: Date | string | number;
  recordUpdatedAt?: Date | string | number;
};

type Self<T> = T;
