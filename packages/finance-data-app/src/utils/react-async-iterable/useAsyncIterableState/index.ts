import { useEffect, useState } from 'react';

export { useAsyncIterableState, type UseAsyncIterableStateReturn };

function useAsyncIterableState<TValue, TInitialValue = undefined>(
  asyncIterOrValue: TValue,
  preIterationInitialtValue: TInitialValue
): UseAsyncIterableStateReturn<TValue, TInitialValue> {
  const [currValue, setCurrValue] = useState<ExtractAsyncIterableValue<TValue> | TInitialValue>(
    preIterationInitialtValue
  ); // Whenever we're pending first iteration, it's always possible we still have an actual value set here from something we consumed previously - therefore the type is either `TValue` or `TInitialValue`
  const [isPendingFirstIteration, setIsPendingFirstIteration] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  // const [currState, setCurrState] = useState<
  //   | {
  //       lastRecentValue: TValue | TInitialValue; // Whenever we're pending first iteration, it's always possible we still have an actual value set here from something we consumed previously - therefore the type is either `TValue` or `TInitialValue`
  //       isPendingFirstIteration: true;
  //       isDone: false;
  //       error: undefined;
  //     }
  //   | ({
  //       lastRecentValue: TValue | TInitialValue;
  //       isPendingFirstIteration: false;
  //     } & (
  //       | {
  //           isDone: false;
  //           error: undefined;
  //         }
  //       | {
  //           isDone: true;
  //           error: unknown;
  //         }
  //     ))
  // >(() => ({
  //   lastRecentValue: preIterationInitialtValue,
  //   isPendingFirstIteration: true,
  //   isDone: false,
  //   error: undefined,
  // }));

  useEffect(() => {
    if (!isAsyncIterable(asyncIterOrValue)) {
      return;
    }

    const iterator = asyncIterOrValue[Symbol.asyncIterator]();
    let iteratorClosedBeforeDone = false;

    setIsPendingFirstIteration(true);
    setIsDone(false);
    setError(undefined);

    (async () => {
      try {
        for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
          if (!iteratorClosedBeforeDone) {
            setCurrValue(value);
            setIsPendingFirstIteration(false);
          }
        }
      } catch (err) {
        if (!iteratorClosedBeforeDone) {
          setError(undefined);
        }
      } finally {
        if (!iteratorClosedBeforeDone) {
          setIsPendingFirstIteration(false);
          setIsDone(true);
        }
      }
    })();

    return () => {
      iterator.return?.();
      iteratorClosedBeforeDone = true;
    };
  }, [asyncIterOrValue]);

  if (!isAsyncIterable(asyncIterOrValue)) {
    return [asyncIterOrValue, false, false, undefined];
  }
  if (isPendingFirstIteration) {
    return [currValue, true, false, undefined];
  }
  if (isDone) {
    return [currValue, isPendingFirstIteration, true, error];
  }
  return [currValue, isPendingFirstIteration, false, undefined];
}

type UseAsyncIterableStateReturn<TValue, TInitialValue = undefined> =
  | [
      lastRecentValue: ExtractAsyncIterableValue<TValue> | TInitialValue,
      isPendingFirstIteration: true,
      isDone: false,
      error: undefined,
    ]
  | [
      lastRecentValue: ExtractAsyncIterableValue<TValue> | TInitialValue,
      isPendingFirstIteration: false,
      ...([isDone: false, error: undefined] | [isDone: true, error: unknown]),
    ];

function isAsyncIterable<T>(input: T): input is T & AsyncIterable<ExtractAsyncIterableValue<T>> {
  return typeof (input as any)?.[Symbol.asyncIterator] === 'function';
}

// ##################################################################################################################################
// ##################################################################################################################################
// ##################################################################################################################################
// ##################################################################################################################################

// const input = (async function* () {
//   yield* [1, 2, 3];
// })();

// if (isAsyncIterable(input)) {
//   input;
// }

// const value: UseAsyncIterableStateReturn<'a', null> = ['a', false, true, 'asdfasdfas'];

type ExtractAsyncIterableValue<T> = T extends AsyncIterable<infer Val> ? Val : T;

// type ___1 = ExtractAsyncIterableValue<AsyncIterable<'a' | 'b'>>;
// type ___2 = ExtractAsyncIterableValue<Promise<'a' | 'b'>>;
// type ___3 = ExtractAsyncIterableValue<'a' | 'b'>;

// type MyTuple = ['a', 'b', 'c', 'd'];
type MyTuple = ['a', 'b', ...([true] | [false])];

type MyFunction = (...args: [] | MyTuple) => void;

const myFunction: MyFunction = (param1, param2) => {};

type MyTuple2<TValue, TInitialValue = undefined> = [
  lastRecentValue: TValue | TInitialValue,
  isPendingFirstIteration: true,
  isDone: false,
  error: undefined,
];

type MyTuple2SlicedToFour<TValue, TInitialValue> = MyTuple2<TValue, TInitialValue>;
type MyTuple2SlicedToThree<TValue, TInitialValue> = [
  lastRecentValue: TValue | TInitialValue,
  isPendingFirstIteration: false,
  isDone: boolean,
];
type MyTuple2SlicedToTwo<TValue, TInitialValue> = [
  lastRecentValue: TValue | TInitialValue,
  isPendingFirstIteration: boolean,
];
type MyTuple2SlicedToOne<TValue, TInitialValue> = [lastRecentValue: TValue | TInitialValue];

type MyFunction2<TValue, TInitialValue = undefined> =
  | ((
      ...[lastRecentValue, isPendingFirstIteration, isDone, error]: MyTuple2SlicedToFour<
        TValue,
        TInitialValue
      >
    ) => void)
  | ((
      ...[lastRecentValue, isPendingFirstIteration, isDone]: MyTuple2SlicedToThree<
        TValue,
        TInitialValue
      >
    ) => void)
  | ((lastRecentValue: TValue | TInitialValue, isPendingFirstIteration: boolean) => void)
  | ((lastRecentValue: TValue | TInitialValue) => void)
  | (() => void);

// type MyFunction2<TValue, TInitialValue = undefined> =
//   | ((...args: MyTuple2SlicedToFour<TValue, TInitialValue>) => void)
//   | ((...args: MyTuple2SlicedToThree<TValue, TInitialValue>) => void)
//   | ((...args: MyTuple2SlicedToTwo<TValue, TInitialValue>) => void)
//   | ((...args: MyTuple2SlicedToOne<TValue, TInitialValue>) => void);

const myFunction2: MyFunction2<string, undefined> = (arg1, arg2) => {
  // if (!arg3) {
  //   // arg4;
  // }
};

// type MyFunction3<TFunc extends (...args: any) => any> = TFunc extends (arg1: any) => any
//   ? (arg1: 'a') => void
//   : TFunc extends (arg1: any, arg2: any) => any
//   ? (arg1: 'a', arg2: 'b') => void
//   : TFunc extends (arg1: any, arg2: any, arg3: any) => any
//   ? (arg1: 'a', arg2: 'b', arg3: 'c') => void
//   : never;
type MyFunction3<TFunc extends (...args: any) => any> = TFunc extends (
  arg1: any,
  arg2: any,
  arg3: any
) => any
  ? (...args: ['a1', 'b1', 'c1'] | ['a2', 'b2']) => void
  : TFunc extends (arg1: any, arg2: any) => any
  ? (...args: ['a2', 'b2']) => void
  : TFunc extends (arg1: any) => any
  ? (...args: ['a3']) => void
  : never;

const myFunction3 = <TFunc extends (...args: any) => any>(inputFn: MyFunction3<TFunc>) => {
  // return inputFn();
};

// myFunction3((a, b, c) => {});

type MyFunction4<TValue, TInitialValue = undefined> =
  | ((
      lastRecentValue: TValue | TInitialValue,
      isPendingFirstIteration: true,
      isDone: false,
      error: undefined
    ) => void)
  | ((
      lastRecentValue: TValue | TInitialValue,
      isPendingFirstIteration: false,
      isDone: false,
      error: undefined
    ) => void)
  | ((
      lastRecentValue: TValue | TInitialValue,
      isPendingFirstIteration: false,
      isDone: false,
      error: undefined
    ) => void);

const myFunction4: MyFunction4<string, undefined> = (a, b, c, d) => {};

// type ParametersExceptLast<F> = F extends (...rest: infer R, lastArg: any) => any ? R : never;

// type ___ = TupleSplitHead<MyTuple2<string, undefined>, 0>;

type TupleSplitHead<T extends any[], N extends number> = T['length'] extends N
  ? T
  : T extends [...infer R, any]
  ? TupleSplitHead<R, N>
  : never;

type TupleSplitTail<T, N extends number, O extends any[] = []> = O['length'] extends N
  ? T
  : T extends [infer F, ...infer R]
  ? TupleSplitTail<[...R], N, [...O, F]>
  : never;

type TupleSplit<T extends any[], N extends number> = [TupleSplitHead<T, N>, TupleSplitTail<T, N>];

type ModifiedTupleSplit = TupleSplitHead<MyTuple2<string>, 2>;
