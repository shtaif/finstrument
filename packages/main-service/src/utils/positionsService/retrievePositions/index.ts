import { Sequelize, Op, type WhereOptions } from 'sequelize';
import { mapValues } from 'lodash';
import { CustomError } from 'shared-utils';
import {
  PositionModel,
  TradeRecordModel,
  type PositionModelAttributes,
} from '../../../db/index.js';
import { type LogicCombinable } from '../../buildWhereClauseFromLogicCombinables.js';
import { isNotEmpty } from '../../isNotEmpty.js';

export { retrievePositions, type Position };

async function retrievePositions(params: {
  filters: LogicCombinable<{
    ids?: string[];
    ownerIds?: string[];
    ownerAliases?: string[];
    symbols?: string[];
    status?: ('OPEN' | 'CLOSED') | ('OPEN' | 'CLOSED')[];
  }>;
  pagination?: {
    offset?: number;
    limit?: number;
  };
  orderBy?: [
    'openedAt' | 'remainingQuantity' | 'realizedProfitOrLoss' | 'investedAmount',
    'ASC' | 'DESC',
  ];
}): Promise<Position[]> {
  const normParams = {
    filters: params.filters,
    orderBy: params.orderBy ?? ['openedAt', 'DESC'],
    pagination: {
      offset: params.pagination?.offset ?? 0,
      limit: params.pagination?.limit ? Math.min(params.pagination.limit, 100) : 100, // TODO: Make excess `limit` values throw an error instead of silently be normalized to `100`
    },
  } satisfies typeof params;

  const { filters, orderBy, pagination } = normParams;

  const tradeRecordModelFields = mapValues(TradeRecordModel.getAttributes(), attr => attr!.field);

  try {
    const positions = await PositionModel.findAll({
      attributes: {
        include: [
          [
            Sequelize.literal(
              `"openingTrade"."${tradeRecordModelFields.quantity}" *` +
                `"openingTrade"."${tradeRecordModelFields.price}"`
            ),
            'investedAmount',
          ],
        ],
      },
      where: (() => {
        const determinedWhere = (function recurse(filterSet): WhereOptions {
          if ('and' in filterSet || 'or' in filterSet) {
            const combinedConditions = ('and' in filterSet ? filterSet.and : filterSet.or)
              .map(recurse)
              .filter(
                filters =>
                  isNotEmpty(filters) ||
                  (filters as any)[Op.and]?.length ||
                  (filters as any)[Op.or]?.length
              );
            return !combinedConditions.length
              ? {}
              : 'and' in filterSet
                ? { [Op.and]: combinedConditions }
                : { [Op.or]: combinedConditions };
          }
          return {
            ...(filterSet.ids?.length && { id: { [Op.in]: filterSet.ids } }),
            ...(filterSet.ownerIds?.length && { '$owner.id$': { [Op.in]: filterSet.ownerIds } }),
            ...(filterSet.ownerAliases?.length && {
              '$owner.alias$': { [Op.in]: filterSet.ownerAliases },
            }),
            ...(filterSet.symbols?.length && { symbol: { [Op.in]: filterSet.symbols } }),
            ...(() => {
              const normStatus = filterSet.status?.length ? [filterSet.status].flat() : [];
              if (
                !normStatus.length ||
                (normStatus.includes('OPEN') && normStatus.includes('CLOSED'))
              ) {
                return {};
              }
              return {
                remainingQuantity: normStatus[0] === 'OPEN' ? { [Op.gt]: 0 } : { [Op.eq]: 0 },
              };
            })(),
          };
        })(filters);
        return determinedWhere;
      })(),
      order: [orderBy],
      offset: pagination.offset,
      limit: pagination.limit,
      include: [
        {
          association: 'owner',
          required: true,
          attributes: [],
        },
        {
          association: 'openingTrade',
          required: true,
          attributes: ['quantity', 'price', 'performedAt'],
        },
        {
          association: 'positionClosings',
          required: false,
          duplicating: false,
          attributes: ['closedQuantity'],
          include: [
            {
              association: 'associatedTrade',
              required: true,
              attributes: ['quantity', 'price', 'performedAt'],
            },
          ],
        },
      ],
    });

    return positions.map(pos => ({
      ...pos.dataValues,
      originalQuantity: pos.openingTrade.quantity,
    }));
  } catch (err: any) {
    if (err.original?.code === '22P02' && err.original?.routine === 'string_to_uuid') {
      // TODO: Figure how to reuse the handling for this error cause for other position service operations for which it is relevant
      const match = ((err.original?.message ?? '') as string).match(/.+"(.+)"$/);
      const invalidInputGiven = match?.[1] ?? '';
      throw new CustomError({
        type: 'INVALID_UUID_FORMAT',
        message: `Some input data expected as a UUID formatted string was received in invalid format; UUID strings must adhere to the form "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" but instead got "${invalidInputGiven}"`,
        details: {
          invalidInputGiven,
        },
      });
    }
    throw err;
  }
}

type Position = PositionModelAttributes & {
  originalQuantity: number;
};
