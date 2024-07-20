import { type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo } from 'sequelize-typescript';
import { UserModel } from './UserModel.js';
import { TradeRecordModel } from './TradeRecordModel.js';
import { HoldingStatsChangeModel } from './HoldingStatsChangeModel.js';

export {
  PortfolioStatsChangeModel,
  type PortfolioStatsChangeModelAttributes,
  type PortfolioStatsChangeModelCreationAttributes,
};

@Table({
  tableName: 'porfolio_stats_changes',
  timestamps: false,
  defaultScope: {},
})
class PortfolioStatsChangeModel extends Model<
  PortfolioStatsChangeModelAttributes,
  PortfolioStatsChangeModelCreationAttributes
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
    field: 'for_currency',
    type: DataType.STRING(3),
    allowNull: true,
  })
  forCurrency!: string | null;

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

  @BelongsTo(() => HoldingStatsChangeModel, {
    foreignKey: 'relatedTradeId',
    targetKey: 'relatedTradeId',
    // onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  relatedHoldingStatsChange!: Self<HoldingStatsChangeModel>;
}

type PortfolioStatsChangeModelAttributes = InferAttributes<PortfolioStatsChangeModel>;

type PortfolioStatsChangeModelCreationAttributes = {
  id?: PortfolioStatsChangeModel['id'];
  ownerId: PortfolioStatsChangeModel['ownerId'];
  relatedTradeId: PortfolioStatsChangeModel['relatedTradeId'];
  forCurrency?: PortfolioStatsChangeModel['forCurrency'];
  totalPresentInvestedAmount?: PortfolioStatsChangeModel['totalPresentInvestedAmount'];
  totalRealizedAmount?: PortfolioStatsChangeModel['totalRealizedAmount'];
  totalRealizedProfitOrLossAmount?: PortfolioStatsChangeModel['totalRealizedProfitOrLossAmount'];
  totalRealizedProfitOrLossRate?: PortfolioStatsChangeModel['totalRealizedProfitOrLossRate'];
  changedAt: Date | string | number;
};

type Self<T> = T;
