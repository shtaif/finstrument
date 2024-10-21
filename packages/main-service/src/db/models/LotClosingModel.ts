import { type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo } from 'sequelize-typescript';
import { TradeRecordModel } from './TradeRecordModel.js';
import { LotModel } from './LotModel.js';

export { LotClosingModel, type LotClosingModelAttributes, type LotClosingModelCreationAttributes };

// TODO: Make foreign keys pointing out from this model into CASCADE DELETE?
@Table({
  tableName: 'lot_closings',
  timestamps: true,
  createdAt: false,
  updatedAt: false,
})
class LotClosingModel extends Model<LotClosingModelAttributes, LotClosingModelCreationAttributes> {
  @Column({
    field: 'lot_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  lotId!: string;

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

  @BelongsTo(() => LotModel, {
    targetKey: 'id',
    foreignKey: 'lotId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  lot!: Self<LotModel>;

  @BelongsTo(() => TradeRecordModel, {
    targetKey: 'id',
    foreignKey: 'associatedTradeId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  associatedTrade!: Self<TradeRecordModel>;
}

type LotClosingModelAttributes = InferAttributes<LotClosingModel>;

type LotClosingModelCreationAttributes = {
  lotId: LotClosingModel['lotId'];
  associatedTradeId: LotClosingModel['associatedTradeId'];
  closedQuantity: LotClosingModel['closedQuantity'];
};

type Self<T> = T;
