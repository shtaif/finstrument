import { type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo } from 'sequelize-typescript';
import { TradeRecordModel } from './TradeRecordModel.js';
import { PositionModel } from './PositionModel.js';

export {
  PositionClosingModel,
  type PositionClosingModelAttributes,
  type PositionClosingModelCreationAttributes,
};

// TODO: Make foreign keys pointing out from this model into CASCADE DELETE?
@Table({
  tableName: 'position_closings',
  timestamps: true,
  createdAt: false,
  updatedAt: false,
})
class PositionClosingModel extends Model<
  PositionClosingModelAttributes,
  PositionClosingModelCreationAttributes
> {
  @Column({
    field: 'position_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  positionId!: string;

  @Column({
    field: 'closing_trade_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  associatedTradeId!: string;

  @Column({
    field: 'closed_quantity',
    type: DataType.FLOAT,
    allowNull: false,
  })
  closedQuantity!: number;

  @BelongsTo(() => PositionModel, {
    targetKey: 'id',
    foreignKey: 'positionId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  position!: Self<PositionModel>;

  @BelongsTo(() => TradeRecordModel, {
    targetKey: 'id',
    foreignKey: 'associatedTradeId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  associatedTrade!: Self<TradeRecordModel>;
}

type PositionClosingModelAttributes = InferAttributes<PositionClosingModel>;

type PositionClosingModelCreationAttributes = {
  positionId: PositionClosingModel['positionId'];
  associatedTradeId: PositionClosingModel['associatedTradeId'];
  closedQuantity: PositionClosingModel['closedQuantity'];
};

type Self<T> = T;
