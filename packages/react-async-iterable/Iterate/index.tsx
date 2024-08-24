import { ReactElement, ReactNode } from 'react';
import { useAsyncIterable, type UseAsyncIterableNext } from '../useAsyncIterable/index.js';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue.js';

export { Iterate, type IterateProps };

// TODO: Fix generic typing/overloads such that if one does not provide function that goes via children, then the `TValue` and `TInitialValue` emitted by the input iterable end up type-constrained to a `ReactNode`

// function Iterate<TValue, TInitialValue>(props: {
//   children: (
//     ...args: UseAsyncIterableNext<ExtractAsyncIterableValue<TValue>, TInitialValue>
//   ) => ReactNode;
//   value: TValue;
//   initialValue?: TInitialValue;
// }): ReactElement;
// function Iterate<TValue, TInitialValue>(props: {
//   children: TValue;
//   value?: undefined;
//   initialValue?: TInitialValue;
// }): ReactElement;
// function Iterate<TValue, TInitialValue>(props: {
//   children?: undefined;
//   value: TValue;
//   initialValue?: TInitialValue;
// }): ReactElement;
function Iterate<
  TValue,
  TInitialValue extends ExtractAsyncIterableValue<TValue> | undefined = undefined,
>(
  props: { initialValue?: TInitialValue } & (
    | {
        children?: (nextIteration: UseAsyncIterableNext<TValue, TInitialValue>) => ReactNode;
        value: TValue;
      }
    | { children: TValue; value?: undefined }
    | { children?: undefined; value: TValue }
  )
): ReactElement {
  const { value, children, initialValue } = props;

  const isChildrenGivenAsFunction = typeof children === 'function';

  const useAsyncIterableResult = useAsyncIterable(
    !isChildrenGivenAsFunction ? children : value,
    initialValue
  );

  return (
    <>
      {isChildrenGivenAsFunction
        ? (children as any)(useAsyncIterableResult)
        : useAsyncIterableResult.value}
    </>
  );
}

type IterateProps<TValue, TInitialValue> = {
  value: TValue;
  initialValue?: TInitialValue;
  children?: (nextIterationState: UseAsyncIterableNext<TValue, TInitialValue>) => ReactNode;
};
