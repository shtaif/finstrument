import { type HasOneOptions, type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo, HasOne } from 'sequelize-typescript';
import { UserModel } from './UserModel.js';
import { TradeRecordModel } from './TradeRecordModel.js';
import { CurrencyStatsChangeModel } from './CurrencyStatsChangeModel.js';

export {
  PositionChangeModel,
  type PositionChangeModelAttributes,
  type PositionChangeModelCreationAttributes,
};

@Table({
  tableName: 'holding_stats_changes',
  timestamps: false,
  defaultScope: {},
})
class PositionChangeModel extends Model<
  PositionChangeModelAttributes,
  PositionChangeModelCreationAttributes
> {
  @Column({
    field: 'related_trade_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  relatedTradeId!: string;

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
    field: 'total_lot_count',
    type: DataType.INTEGER,
    defaultValue: 0,
    allowNull: false,
  })
  totalLotCount!: number;

  @Column({
    field: 'total_quantity',
    type: DataType.FLOAT,
    defaultValue: 0,
    allowNull: false,
  })
  totalQuantity!: number;

  @Column({
    field: 'total_invested_amount',
    type: DataType.FLOAT,
    defaultValue: 0,
    allowNull: false,
  })
  totalPresentInvestedAmount!: number;

  @Column({
    field: 'total_realized_amount',
    type: DataType.FLOAT,
    defaultValue: 0,
    allowNull: false,
  })
  totalRealizedAmount!: number;

  @Column({
    field: 'total_realized_profit_or_loss_amount',
    type: DataType.FLOAT,
    defaultValue: 0,
    allowNull: false,
  })
  totalRealizedProfitOrLossAmount!: number;

  @Column({
    field: 'total_realized_profit_or_loss_rate',
    type: DataType.FLOAT,
    defaultValue: 0,
    allowNull: false,
  })
  totalRealizedProfitOrLossRate!: number;

  @Column({
    field: 'changed_at',
    type: DataType.DATE,
    allowNull: false,
  })
  changedAt!: Date;

  @BelongsTo(() => UserModel, {
    foreignKey: 'ownerId',
    targetKey: 'id',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  owner!: Self<UserModel>;

  @BelongsTo(() => TradeRecordModel, {
    foreignKey: 'relatedTradeId',
    targetKey: 'id',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  relatedTrade!: Self<TradeRecordModel>;

  @HasOne(() => CurrencyStatsChangeModel, {
    foreignKey: 'relatedTradeId',
    sourceKey: 'relatedTradeId',
  } satisfies HasOneOptions)
  relatedPortfolioStatsChange!: Self<CurrencyStatsChangeModel>;
}

type PositionChangeModelAttributes = InferAttributes<PositionChangeModel>;

type PositionChangeModelCreationAttributes = {
  id?: PositionChangeModel['id'];
  ownerId: PositionChangeModel['ownerId'];
  symbol: PositionChangeModel['symbol'];
  relatedTradeId: PositionChangeModel['relatedTradeId'];
  totalLotCount?: PositionChangeModel['totalLotCount'];
  totalQuantity?: PositionChangeModel['totalQuantity'];
  totalPresentInvestedAmount?: PositionChangeModel['totalPresentInvestedAmount'];
  totalRealizedAmount?: PositionChangeModel['totalRealizedAmount'];
  totalRealizedProfitOrLossAmount?: PositionChangeModel['totalRealizedProfitOrLossAmount'];
  totalRealizedProfitOrLossRate?: PositionChangeModel['totalRealizedProfitOrLossRate'];
  changedAt: Date | string | number;
};

type Self<T> = T;
