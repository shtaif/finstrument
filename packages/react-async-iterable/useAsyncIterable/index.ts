import { useEffect, useState } from 'react';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue.js';

export { useAsyncIterable, type UseAsyncIterableNext };

// TODO: The initial value can be given as a function, which the internal `useState` would invoke as it's defined to do. So the typings should take into account it possibly being a function and if that's the case then to extract its return type instead of using the function type itself

function useAsyncIterable<TValue>(
  asyncIterOrValue: AsyncIterable<TValue>,
  preIterationInitialValue?: undefined
): UseAsyncIterableNext<TValue, undefined>;
function useAsyncIterable<TValue, TInitValue = undefined>(
  asyncIterOrValue: TValue,
  preIterationInitialValue: TInitValue
): UseAsyncIterableNext<TValue, TInitValue>;
function useAsyncIterable<TValue, TInitValue = undefined>(
  asyncIterOrValue: TValue,
  preIterationInitialValue: TInitValue
): UseAsyncIterableNext<TValue, TInitValue> {
  const [currValue, setCurrValue] = useState<ExtractAsyncIterableValue<TValue> | TInitValue>(
    preIterationInitialValue
  ); // Whenever we're pending first iteration, it's always possible we still have an actual value set here from something we consumed previously - therefore the type is either `TValue` or `TInitValue`
  const [isPendingFirstIteration, setIsPendingFirstIteration] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<unknown>(undefined);

  // const [currState, setCurrState] = useState<
  //   | {
  //       lastRecentValue: TValue | TInitValue; // Whenever we're pending first iteration, it's always possible we still have an actual value set here from something we consumed previously - therefore the type is either `TValue` or `TInitValue`
  //       isPendingFirstIteration: true;
  //       isDone: false;
  //       error: undefined;
  //     }
  //   | ({
  //       lastRecentValue: TValue | TInitValue;
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
  //   lastRecentValue: preIterationInitialValue,
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

  return {
    value: !isAsyncIterable(asyncIterOrValue)
      ? (asyncIterOrValue as ExtractAsyncIterableValue<TValue>)
      : currValue,

    ...(isPendingFirstIteration
      ? {
          pendingFirst: true,
          done: false,
          error: undefined,
        }
      : {
          pendingFirst: false,
          ...(!isDone
            ? {
                done: false,
                error: undefined,
              }
            : {
                done: true,
                error,
              }),
        }),
  };
}

type UseAsyncIterableNext<TValue, TInitValue = undefined> = {
  /** The last most recently received value */
  value: ExtractAsyncIterableValue<TValue> | TInitValue;
} & (
  | {
      pendingFirst: true;
      done: false;
      error: undefined;
    }
  | ({
      pendingFirst: false;
    } & (
      | {
          done: false;
          error: undefined;
        }
      | {
          done: true;
          error: unknown;
        }
    ))
);

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

// const value: UseAsyncIterableNext<'a', null> = ['a', false, true, 'asdfasdfas'];

// type ___1 = ExtractAsyncIterableValue<AsyncIterable<'a' | 'b'>>;
// type ___2 = ExtractAsyncIterableValue<Promise<'a' | 'b'>>;
// type ___3 = ExtractAsyncIterableValue<'a' | 'b'>;

/*

// type MyTuple = ['a', 'b', 'c', 'd'];
type MyTuple = ['a', 'b', ...([true] | [false])];

type MyFunction = (...args: [] | MyTuple) => void;

const myFunction: MyFunction = (param1, param2) => {};

type MyTuple2<TValue, TInitValue = undefined> = [
  lastRecentValue: TValue | TInitValue,
  isPendingFirstIteration: true,
  isDone: false,
  error: undefined,
];

type MyTuple2SlicedToFour<TValue, TInitValue> = MyTuple2<TValue, TInitValue>;
type MyTuple2SlicedToThree<TValue, TInitValue> = [
  lastRecentValue: TValue | TInitValue,
  isPendingFirstIteration: false,
  isDone: boolean,
];
type MyTuple2SlicedToTwo<TValue, TInitValue> = [
  lastRecentValue: TValue | TInitValue,
  isPendingFirstIteration: boolean,
];
type MyTuple2SlicedToOne<TValue, TInitValue> = [lastRecentValue: TValue | TInitValue];

type MyFunction2<TValue, TInitValue = undefined> =
  | ((
      ...[lastRecentValue, isPendingFirstIteration, isDone, error]: MyTuple2SlicedToFour<
        TValue,
        TInitValue
      >
    ) => void)
  | ((
      ...[lastRecentValue, isPendingFirstIteration, isDone]: MyTuple2SlicedToThree<
        TValue,
        TInitValue
      >
    ) => void)
  | ((lastRecentValue: TValue | TInitValue, isPendingFirstIteration: boolean) => void)
  | ((lastRecentValue: TValue | TInitValue) => void)
  | (() => void);

// type MyFunction2<TValue, TInitValue = undefined> =
//   | ((...args: MyTuple2SlicedToFour<TValue, TInitValue>) => void)
//   | ((...args: MyTuple2SlicedToThree<TValue, TInitValue>) => void)
//   | ((...args: MyTuple2SlicedToTwo<TValue, TInitValue>) => void)
//   | ((...args: MyTuple2SlicedToOne<TValue, TInitValue>) => void);

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

type MyFunction4<TValue, TInitValue = undefined> =
  | ((
      lastRecentValue: TValue | TInitValue,
      isPendingFirstIteration: true,
      isDone: false,
      error: undefined
    ) => void)
  | ((
      lastRecentValue: TValue | TInitValue,
      isPendingFirstIteration: false,
      isDone: false,
      error: undefined
    ) => void)
  | ((
      lastRecentValue: TValue | TInitValue,
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

*/
