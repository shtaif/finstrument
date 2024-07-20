import { ReactElement, ReactNode } from 'react';
import { useAsyncIterable, type UseAsyncIterableReturn } from '../useAsyncIterable';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue';

export { Iterate, type IterateProps };

// TODO: Fix generic typing/overloads such that if one does not provide function that goes via children, then the `TValue` and `TInitialValue` emitted by the input iterable end up type-constrained to a `ReactNode`

// function Iterate<TValue, TInitialValue>(props: {
//   children: (
//     ...args: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>
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
function Iterate<TValue, TInitialValue = undefined>(
  props: { initialValue?: TInitialValue } & (
    | {
        children?: (
          // ...args: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>
          lastRecentValue: UseAsyncIterableReturn<
            ExtractAsyncIterableValue<TValue>,
            TInitialValue
          >[0],
          isPendingFirstIteration: UseAsyncIterableReturn<
            ExtractAsyncIterableValue<TValue>,
            TInitialValue
          >[1],
          isDone: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>[2],
          error: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>[3]
        ) => ReactNode;
        value: TValue;
      }
    | { children: TValue; value?: undefined }
    | { children?: undefined; value: TValue }
  )
): ReactElement {
  const { value, children, initialValue } = props;

  const isChildrenGivenAsFunction = typeof children === 'function';

  const [currentValue, isDone, isPendingFirstValue, error] = useAsyncIterable(
    !isChildrenGivenAsFunction ? children : value,
    initialValue
  );

  return (
    <>
      {isChildrenGivenAsFunction
        ? (children as any)(currentValue, isDone, isPendingFirstValue, error)
        : currentValue}
    </>
  );
}

type IterateProps<TValue, TInitialValue> = {
  value: TValue;
  initialValue?: TInitialValue;
  children?: (
    ...args: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>
  ) => ReactNode;
};

// type IterateProps2<TValue, TInitialValue = undefined> = {
//   initialValue?: TInitialValue;
// } & (
//   | {
//       children: (
//         ...args: UseAsyncIterableReturn<ExtractAsyncIterableValue<TValue>, TInitialValue>
//       ) => ReactNode;
//       value: TValue;
//     }
//   | {
//       children: TValue;
//       value?: undefined;
//     }
//   | {
//       children?: undefined;
//       value: TValue;
//     }
// );
