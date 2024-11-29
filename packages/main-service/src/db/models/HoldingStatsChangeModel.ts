import { type HasOneOptions, type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo, HasOne } from 'sequelize-typescript';
import { UserModel } from './UserModel.js';
import { TradeRecordModel } from './TradeRecordModel.js';
import { CurrencyStatsChangeModel } from './CurrencyStatsChangeModel.js';

export {
  HoldingStatsChangeModel,
  type HoldingStatsChangeModelAttributes,
  type HoldingStatsChangeModelCreationAttributes,
};

@Table({
  tableName: 'holding_stats_changes',
  timestamps: false,
  defaultScope: {},
})
class HoldingStatsChangeModel extends Model<
  HoldingStatsChangeModelAttributes,
  HoldingStatsChangeModelCreationAttributes
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

type HoldingStatsChangeModelAttributes = InferAttributes<HoldingStatsChangeModel>;

type HoldingStatsChangeModelCreationAttributes = {
  id?: HoldingStatsChangeModel['id'];
  ownerId: HoldingStatsChangeModel['ownerId'];
  symbol: HoldingStatsChangeModel['symbol'];
  relatedTradeId: HoldingStatsChangeModel['relatedTradeId'];
  totalLotCount?: HoldingStatsChangeModel['totalLotCount'];
  totalQuantity?: HoldingStatsChangeModel['totalQuantity'];
  totalPresentInvestedAmount?: HoldingStatsChangeModel['totalPresentInvestedAmount'];
  totalRealizedAmount?: HoldingStatsChangeModel['totalRealizedAmount'];
  totalRealizedProfitOrLossAmount?: HoldingStatsChangeModel['totalRealizedProfitOrLossAmount'];
  totalRealizedProfitOrLossRate?: HoldingStatsChangeModel['totalRealizedProfitOrLossRate'];
  changedAt: Date | string | number;
};

type Self<T> = T;
