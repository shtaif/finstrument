import { each } from 'lodash';
import { pipe } from 'shared-utils';

export { buildWhereClauseFromLogicCombinables, type LogicCombinable };

function buildWhereClauseFromLogicCombinables<T extends {}>(
  filters: LogicCombinable<T>,
  fieldFormatters: {
    [K in keyof T]: (val: Exclude<T[K], undefined>) => string | undefined;
  }
): string {
  const whereSql = (function recurse(filterSet): string | undefined {
    if ('and' in filterSet) {
      return pipe(
        filterSet.and,
        v => v.map(recurse),
        v => v.filter(Boolean),
        v => (v.length ? `${v.join(' AND\n')}` : undefined)
      );
    }

    if ('or' in filterSet) {
      return pipe(
        filterSet.or,
        v => v.map(recurse),
        v => v.filter(Boolean),
        v => (v.length ? `${v.join(' OR\n')}` : undefined)
      );
    }

    const sqlConditions: string[] = [];

    each(filterSet, (value, k) => {
      if (value !== undefined) {
        const valueNonUndefined = value as Exclude<T[keyof T], undefined>;
        const formattedCondition = fieldFormatters[k as keyof T]?.(valueNonUndefined);
        if (formattedCondition) {
          sqlConditions.push(formattedCondition);
        }
      }
    });

    return sqlConditions.length ? `(${sqlConditions.join(' AND\n')})` : undefined;
  })(filters);

  return whereSql ? `WHERE ${whereSql}` : '';
}

type LogicCombinable<T extends {}> =
  | T
  | { and: LogicCombinable<T>[] }
  | { or: LogicCombinable<T>[] };
