import { type InferAttributes } from 'sequelize';
import { Model, DataType, Table, Column } from 'sequelize-typescript';

export {
  InstrumentInfoModel,
  type InstrumentInfoModelAttributes,
  type InstrumentInfoModelCreationAttributes,
};

@Table({
  tableName: 'instrument_infos',
  timestamps: true,
  defaultScope: {},
})
class InstrumentInfoModel extends Model<
  InstrumentInfoModelAttributes,
  InstrumentInfoModelCreationAttributes
> {
  @Column({
    field: 'symbol',
    type: DataType.STRING(16),
    allowNull: false,
    primaryKey: true,
  })
  symbol!: string;

  @Column({
    field: 'name',
    type: DataType.STRING(64),
    allowNull: false,
  })
  name!: string;

  @Column({
    field: 'exchange_mic_code',
    type: DataType.STRING(5),
    allowNull: false,
  })
  exchangeMic!: string;

  @Column({
    field: 'exchange_acronym',
    type: DataType.STRING(64),
    allowNull: true,
  })
  exchangeAcronym!: string | null;

  @Column({
    field: 'exchange_full_name',
    type: DataType.STRING(64),
    allowNull: true,
  })
  exchangeFullName!: string | null;

  @Column({
    field: 'exchange_country_code',
    type: DataType.STRING(2),
    allowNull: true,
  })
  exchangeCountryCode!: string | null;

  @Column({
    field: 'currency',
    type: DataType.STRING(3),
    allowNull: true,
  })
  currency!: string | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}

type InstrumentInfoModelAttributes = InferAttributes<InstrumentInfoModel>;

type InstrumentInfoModelCreationAttributes = {
  symbol: InstrumentInfoModel['symbol'];
  name: InstrumentInfoModel['name'];
  exchangeMic: InstrumentInfoModel['exchangeMic'];
  exchangeAcronym?: InstrumentInfoModel['exchangeAcronym'];
  exchangeFullName?: InstrumentInfoModel['exchangeFullName'];
  exchangeCountryCode?: InstrumentInfoModel['exchangeCountryCode'];
  currency?: InstrumentInfoModel['currency'];
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number;
};
