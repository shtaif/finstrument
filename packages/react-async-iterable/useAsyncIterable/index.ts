import { useRef, useMemo, useEffect } from 'react';
import { type ExtractAsyncIterableValue } from '../common/ExtractAsyncIterableValue.js';
import { useLatest } from '../utils/hooks/useLatest.js';
import { isAsyncIter } from '../utils/isAsyncIter.js';
import { useSimpleUpdater } from '../utils/hooks/useSimpleUpdater.js';
import {
  reactAsyncIterSpecialInfoSymbol,
  ReactAsyncIterSpecialInfo,
} from '../common/reactAsyncIterSpecialInfoSymbol.js';

export { useAsyncIterable, type IterationResult };

// TODO: The initial value can be given as a function, which the internal `useState` would invoke as it's defined to do. So the typings should take into account it possibly being a function and if that's the case then to extract its return type instead of using the function type itself

function useAsyncIterable<TValue>(
  input: AsyncIterable<TValue>,
  preIterationInitialValue?: undefined
): IterationResult<TValue, undefined>;

function useAsyncIterable<TValue, TInitValue = undefined>(
  input: TValue,
  preIterationInitialValue: TInitValue
): IterationResult<TValue, TInitValue>;

function useAsyncIterable<TValue, TInitValue = undefined>(
  input: TValue,
  preIterationInitialValue: TInitValue
): IterationResult<TValue, TInitValue> {
  const rerender = useSimpleUpdater();

  const stateRef = useRef<IterationResult<TValue, TInitValue>>({
    value: preIterationInitialValue,
    pendingFirst: true,
    done: false,
    error: undefined,
  });

  const latestInputRef = useLatest(
    input as typeof input & {
      [reactAsyncIterSpecialInfoSymbol]?: ReactAsyncIterSpecialInfo<
        unknown,
        ExtractAsyncIterableValue<TValue>
      >;
    }
  );

  if (!isAsyncIter(latestInputRef.current)) {
    useMemo(() => {}, [undefined]);
    useEffect(() => {}, [undefined]);

    return (stateRef.current = {
      value: latestInputRef.current as ExtractAsyncIterableValue<TValue>,
      pendingFirst: false,
      done: false,
      error: undefined,
    });
  } else {
    const iterObjToUse =
      latestInputRef.current[reactAsyncIterSpecialInfoSymbol]?.origPreformattedSource ??
      latestInputRef.current;

    useMemo(() => {
      stateRef.current = {
        value: stateRef.current.value,
        pendingFirst: true,
        done: false,
        error: undefined,
      };
    }, [iterObjToUse]);

    useEffect(() => {
      const iterator = (iterObjToUse as AsyncIterable<ExtractAsyncIterableValue<TValue>>)[
        Symbol.asyncIterator
      ]();
      let iteratorClosedAbruptly = false;

      (async () => {
        let iterationIdx = 0;
        try {
          for await (const value of { [Symbol.asyncIterator]: () => iterator }) {
            if (!iteratorClosedAbruptly) {
              const formatFn =
                latestInputRef.current[reactAsyncIterSpecialInfoSymbol]?.formatFn ?? identity;
              stateRef.current = {
                value: formatFn(value, iterationIdx++),
                pendingFirst: false,
                done: false,
                error: undefined,
              };
              rerender();
            }
          }
          if (!iteratorClosedAbruptly) {
            stateRef.current = {
              value: stateRef.current.value,
              pendingFirst: false,
              done: true,
              error: undefined,
            };
            rerender();
          }
        } catch (err) {
          if (!iteratorClosedAbruptly) {
            stateRef.current = {
              value: stateRef.current.value,
              pendingFirst: false,
              done: true,
              error: err,
            };
            rerender();
          }
        }
      })();

      return () => {
        iteratorClosedAbruptly = true;
        iterator.return?.();
      };
    }, [iterObjToUse]);

    return stateRef.current;
  }
}

function identity<T>(input: T): T {
  return input;
}

type IterationResult<TValue, TInitValue = undefined> = {
  /** The most recent value received */
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

// ##################################################################################################################################
// ##################################################################################################################################
// ##################################################################################################################################
// ##################################################################################################################################

// const input = (async function* () {
//   yield* [1, 2, 3];
// })();

// if (isAsyncIter(input)) {
//   input;
// }

// const value: IterationResult<'a', null> = ['a', false, true, 'asdfasdfas'];

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
