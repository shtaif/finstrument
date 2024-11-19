import { isObjectLike } from 'lodash-es';
import { type SetIntersection, type PickByValue } from 'utility-types';

export { deepObjectPickFields, type DeepObjectFieldsPicked };

function deepObjectPickFields<
  TObj extends object,
  // TFieldSelectTree extends AllLeafPropsIntoBools<TObj>,
  TFieldSelectTree extends Record<string, any>,
>(
  sourceObj: TObj,
  fieldSelectTree: TFieldSelectTree
): DeepObjectFieldsPicked<TObj, TFieldSelectTree> {
  const deepReformattedObjResult = (function recurse(
    sourceObj: Record<string, any>,
    selectedFieldsNode: Record<string, any>
  ) {
    const resultObj: Record<string, any> = {};

    for (const field in selectedFieldsNode) {
      const fieldVal = selectedFieldsNode[field];
      if (fieldVal === true) {
        resultObj[field] = sourceObj[field];
      } else if (isObjectLike(fieldVal) && isObjectLike(sourceObj[field])) {
        if (!Array.isArray(sourceObj[field])) {
          resultObj[field] = recurse(sourceObj[field], fieldVal);
        } else {
          resultObj[field] = sourceObj[field].map(sourceObjItem =>
            recurse(sourceObjItem, fieldVal)
          );
        }
      }
    }

    return resultObj;
  })(sourceObj, fieldSelectTree) as DeepObjectFieldsPicked<TObj, TFieldSelectTree>;

  return deepReformattedObjResult;
}

type DeepObjectFieldsPicked<
  TObj extends object,
  TFieldSelection /* extends AllLeafPropsIntoBools<TObj>*/,
> = {
  [K in SetIntersection<keyof TObj, keyof PickByValue<TFieldSelection, true>>]: TObj[K];
} & {
  [K in SetIntersection<keyof TObj, keyof TFieldSelection> as TFieldSelection[K] extends false
    ? never
    : TFieldSelection[K] extends true
      ? never
      : TFieldSelection[K] extends boolean
        ? K
        : never]?: TObj[K];
} & {
  [K in SetIntersection<
    keyof PickByValue<TObj, object | object[]>,
    keyof PickByValue<TFieldSelection, object>
  >]: TObj[K] extends object[]
    ? DeepObjectFieldsPicked<TObj[K][number], TFieldSelection[K]>[]
    : TObj[K] extends object
      ? TFieldSelection[K] extends object
        ? DeepObjectFieldsPicked<TObj[K], TFieldSelection[K]>
        : never
      : never;
};
