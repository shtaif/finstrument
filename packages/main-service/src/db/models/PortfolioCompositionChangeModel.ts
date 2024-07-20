import { type BelongsToOptions, type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column, BelongsTo } from 'sequelize-typescript';
import { HoldingStatsChangeModel } from './HoldingStatsChangeModel.js';
import { PortfolioStatsChangeModel } from './PortfolioStatsChangeModel.js';
// import { UserModel } from './UserModel';

export {
  PortfolioCompositionChangeModel,
  type PortfolioCompositionChangeModelAttributes,
  type PortfolioCompositionChangeModelCreationAttributes,
};

@Table({
  tableName: 'porfolio_composition_changes',
  timestamps: false,
  defaultScope: {},
})
class PortfolioCompositionChangeModel extends Model<
  PortfolioCompositionChangeModelAttributes,
  PortfolioCompositionChangeModelCreationAttributes
> {
  @Column({
    field: 'related_holding_change_id',
    type: DataType.UUID,
    allowNull: false,
    primaryKey: true,
  })
  relatedHoldingChangeId!: string;

  // @Column({
  //   field: 'owner_id',
  //   type: DataType.UUID,
  //   allowNull: false,
  //   primaryKey: true,
  // })
  // ownerId!: string;

  @Column({
    field: 'symbol',
    type: DataType.STRING(16),
    allowNull: false,
    primaryKey: true,
  })
  symbol!: string;

  // @Column({
  //   field: 'date',
  //   type: DataType.DATE,
  //   allowNull: false,
  //   primaryKey: true,
  // })
  // date!: Date;

  @Column({
    field: 'portion',
    type: DataType.FLOAT,
    allowNull: false,
  })
  portion!: number;

  @BelongsTo(() => HoldingStatsChangeModel, {
    foreignKey: 'relatedHoldingChangeId',
    targetKey: 'relatedTradeId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  relatedHoldingChange!: Self<HoldingStatsChangeModel>;

  @BelongsTo(() => PortfolioStatsChangeModel, {
    foreignKey: 'relatedHoldingChangeId',
    targetKey: 'relatedTradeId',
    onDelete: 'CASCADE',
  } satisfies BelongsToOptions)
  relatedPortfolioChange!: Self<PortfolioStatsChangeModel>;

  // @BelongsTo(() => UserModel, {
  //   foreignKey: 'ownerId',
  //   targetKey: 'id',
  //   onDelete: 'CASCADE',
  // } satisfies BelongsToOptions)
  // owner!: UserModel;
}

type PortfolioCompositionChangeModelAttributes = InferAttributes<PortfolioCompositionChangeModel>;

type PortfolioCompositionChangeModelCreationAttributes = {
  relatedHoldingChangeId: PortfolioCompositionChangeModel['relatedHoldingChangeId'];
  // ownerId: PortfolioCompositionChangeModel['ownerId'];
  symbol: PortfolioCompositionChangeModel['symbol'];
  // date: Date | string | number;
  portion: PortfolioCompositionChangeModel['portion'];
};

type Self<T> = T;
