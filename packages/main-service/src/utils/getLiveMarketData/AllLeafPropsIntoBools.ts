export { type AllLeafPropsIntoBools };

type AllLeafPropsIntoBools<T> = AllLeafPropsIntoBoolsInnerTraverser<DeepFlattenNestedArrays<T>>;

type AllLeafPropsIntoBoolsInnerTraverser<T> = {
  [K in keyof T]?: T[K] extends { [k: string]: unknown }
    ? AllLeafPropsIntoBoolsInnerTraverser<T[K]>
    : boolean;
};

type DeepFlattenNestedArrays<T> = T extends unknown[]
  ? DeepFlattenNestedArrays<T[number]>
  : T extends { [k: string]: unknown }
    ? {
        [K in keyof T]: DeepFlattenNestedArrays<T[K]>;
      }
    : T;
