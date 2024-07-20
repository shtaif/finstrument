import { empty } from '@reactivex/ix-esnext-esm/asynciterable';
// import { pipe } from 'shared-utils';
// import { switchMap } from '@reactivex/ix-esnext-esm/asynciterable/operators/switchmap';
// import promiseWithResolvers from './utils/promiseWithResolvers';

export { itSwitchMap };

// function itSwitchMap<TSource, TResult>(
//   selector: (
//     srcValue: TSource,
//     idx: number,
//     signal?: AbortSignal | undefined
//   ) => AsyncIterable<TResult>
// ): (source: AsyncIterable<TSource>) => AsyncIterable<TResult> {
//   return source => ({
//     [Symbol.asyncIterator]() {
//       const sourceIterator = source[Symbol.asyncIterator]();
//       let currInnerIterator: AsyncIterator<TResult> | undefined;
//       const shortCircuitInnerIteratorPromiseWithResolvers = promiseWithResolvers<never>();

//       const modifiedOperatorIterable = pipe(
//         { [Symbol.asyncIterator]: () => sourceIterator },
//         switchMap<TSource, TResult>((value, idx, signal) => {
//           signal!.addEventListener('abort', event => {
//             value;
//             selectorIterable;
//             // currInnerIterator?.return?.();
//           });

//           const selectorIterable = selector(value, idx, signal);

//           return {
//             [Symbol.asyncIterator]() {
//               currInnerIterator = selectorIterable[Symbol.asyncIterator]();
//               return {
//                 async next() {
//                   try {
//                     return await currInnerIterator!.next();
//                   } catch (err) {
//                     shortCircuitInnerIteratorPromiseWithResolvers.reject(err); // we use this controlled promise to make it possible to interrupt to the main upper iterator if is currently handling an active pull, letting it stop awaiting and immediately propagate the error onwards. That's becuase it seemed `ix`'s `switchMap` operator doesn't immediately cut off its unsettled pull in order to propagate an error thrown from the current inner iterator. I think it only notices and conveys this error once it clears off some previous unsettled pull - as a generator would do.
//                     throw err;
//                   }
//                 },
//                 async return() {
//                   value;
//                   return (
//                     currInnerIterator!.return?.() ?? {
//                       done: true as const,
//                       value: undefined,
//                     }
//                   );
//                 },
//               };
//             },
//           };
//         })
//       );

//       const modifiedOperatorIterator = modifiedOperatorIterable[Symbol.asyncIterator]();

//       return {
//         next: async () => {
//           return Promise.race([
//             modifiedOperatorIterator.next(),
//             shortCircuitInnerIteratorPromiseWithResolvers.promise,
//           ]);
//         },
//         return: async () => {
//           await Promise.all([
//             modifiedOperatorIterator.return!(),
//             currInnerIterator?.return?.(),
//             sourceIterator.return?.(),
//           ]);
//           return { done: true, value: undefined };
//         },
//       };
//     },
//   });
// }

function itSwitchMap<TSourceVal, TInnerVal>(
  mapFn: (srcVal: TSourceVal) => AsyncIterable<TInnerVal> | Iterable<TInnerVal>
): (source: AsyncIterable<TSourceVal>) => AsyncIterable<TInnerVal> {
  return source => ({
    [Symbol.asyncIterator]() {
      let sourceIterator: AsyncIterator<TSourceVal> | undefined;
      let currInnerIterator: AsyncIterator<TInnerVal> | Iterator<TInnerVal> = reusedEmptyIterator;
      let nextInnerIteratorPromise: Promise<
        AsyncIterator<TInnerVal> | Iterator<TInnerVal> | undefined
      >;
      let stoppedByConsumer = false;

      return {
        async next() {
          if (!sourceIterator) {
            sourceIterator = source[Symbol.asyncIterator]();

            (async () => {
              while (true) {
                const sourceIteratorNextPromise = sourceIterator.next();

                nextInnerIteratorPromise = (async () => {
                  const sourceNext = await sourceIteratorNextPromise;
                  if (sourceNext.done) {
                    return;
                  }
                  await currInnerIterator.return?.();
                  if (stoppedByConsumer) {
                    return;
                  }
                  const innerIterable = mapFn(sourceNext.value);
                  return Symbol.asyncIterator in innerIterable
                    ? innerIterable[Symbol.asyncIterator]()
                    : innerIterable[Symbol.iterator]();
                })();

                const nextInnerIterator = await nextInnerIteratorPromise;

                if (!nextInnerIterator || stoppedByConsumer) {
                  break;
                }

                currInnerIterator = nextInnerIterator;
              }
            })();
          }

          try {
            do {
              const next = await currInnerIterator.next();
              if (!next.done) {
                return next;
              }
            } while (await nextInnerIteratorPromise);
            return { done: true, value: undefined };
          } catch (err) {
            await sourceIterator.return?.();
            throw err;
          }
        },

        async return() {
          stoppedByConsumer = true;

          await Promise.all([
            sourceIterator?.return?.(),
            currInnerIterator.return?.(),
            (async () => {
              const innerIterator = await nextInnerIteratorPromise;
              await innerIterator?.return?.();
            })(),
          ]);

          return { done: true, value: undefined };
        },
      };
    },
  });
}

const reusedEmptyIterator = empty()[Symbol.asyncIterator]();
