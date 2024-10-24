import { isObjectLike } from 'lodash-es';
import { type SetIntersection, type OmitByValue } from 'utility-types';

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
  [K in SetIntersection<
    keyof TObj,
    keyof OmitByValue<TFieldSelection, undefined | false>
  >]: TFieldSelection[K] extends true
    ? TObj[K]
    : TObj[K] extends object[]
      ? DeepObjectFieldsPicked<TObj[K][number], NonNullable<TFieldSelection[K]>>[]
      : TObj[K] extends object
        ? TFieldSelection[K] extends object
          ? DeepObjectFieldsPicked<TObj[K], TFieldSelection[K]>
          : never
        : never;
};
