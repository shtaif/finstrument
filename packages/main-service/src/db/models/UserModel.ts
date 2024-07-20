import { type InferAttributes } from 'sequelize';
import { Sequelize, Model, DataType, Table, Column } from 'sequelize-typescript';

export { UserModel, type UserModelAttributes, type UserModelCreationAttributes };

@Table({
  tableName: 'users',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
})
class UserModel extends Model<UserModelAttributes, UserModelCreationAttributes> {
  @Column({
    field: 'id',
    type: DataType.UUID,
    defaultValue: Sequelize.literal('uuid_generate_v4()'),
    allowNull: false,
    primaryKey: true,
  })
  id!: string;

  // TODO: Enforce minimum 2 chars?
  @Column({
    field: 'alias',
    type: DataType.STRING(50),
    allowNull: false,
  })
  alias!: string;

  @Column({
    field: 'created_at',
    type: DataType.DATE,
    allowNull: false,
  })
  declare createdAt: Date;

  @Column({
    field: 'updated_at',
    type: DataType.DATE,
    allowNull: true,
  })
  declare updatedAt: Date | null;
}

type UserModelAttributes = InferAttributes<UserModel>;

type UserModelCreationAttributes = {
  id?: UserModel['id'];
  alias: UserModel['alias'];
  createdAt?: Date | string | number;
  updatedAt?: Date | string | number | null;
};
