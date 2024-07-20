export { itShare };

// function itShare<TValue>(): (srcIterable: AsyncIterable<TValue>) => AsyncIterable<TValue> {
//   return srcIterable => {
//     // let sharedSourceIterator: AsyncIterator<TValue>;
//     let sharedSourceTeardownInProgressPromise: Promise<unknown> | undefined;
//     // let nextPromise: Promise<IteratorResult<TValue, undefined | void>> | undefined;
//     // let activeSubIteratorsCount = 0;

//     let sharedState:
//       | {
//           sourceIterator: AsyncIterator<TValue>;
//           nextPromise: Promise<IteratorResult<TValue, undefined | void>> | undefined;
//           activeSubIteratorsCount: number;
//         }
//       | undefined;

//     return {
//       [Symbol.asyncIterator]() {
//         let iteratorClosed = false;

//         if (!sharedState) {
//           sharedState = {
//             sourceIterator: srcIterable[Symbol.asyncIterator](),
//             nextPromise: undefined,
//             activeSubIteratorsCount: 1,
//           };
//         } else {
//           sharedState.activeSubIteratorsCount++;
//         }

//         const thisSharedState = sharedState;

//         // TODO: Should wrap each iterator's returned promise such that it can be immediately early-resolved to a "done" result when the iterator gets early-closed?

//         return {
//           async next() {
//             // if (sharedSourceTeardownInProgressPromise) {
//             await sharedSourceTeardownInProgressPromise;
//             // }
//             if (iteratorClosed) {
//               return { done: true, value: undefined };
//             }
//             thisSharedState.nextPromise ??= thisSharedState.sourceIterator
//               .next()
//               .finally(() => (thisSharedState.nextPromise = undefined));
//             return thisSharedState.nextPromise;
//           },

//           async return() {
//             if (!iteratorClosed) {
//               iteratorClosed = true;
//               sharedState = undefined;
//               if (--thisSharedState.activeSubIteratorsCount === 0) {
//                 await (sharedSourceTeardownInProgressPromise = (async () => {
//                   if (sharedSourceTeardownInProgressPromise) {
//                     await sharedSourceTeardownInProgressPromise;
//                   }
//                   try {
//                     if (thisSharedState.sourceIterator.return) {
//                       await thisSharedState.sourceIterator.return();
//                     }
//                   } finally {
//                     // sharedSourceTeardownInProgressPromise = undefined;
//                   }
//                 })());
//               }
//             }
//             return { done: true, value: undefined };
//           },
//         };
//       },
//     };
//   };
// }

function itShare<TValue>(): (srcIterable: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return srcIterable => {
    let sharedSourceIterator: AsyncIterator<TValue>;
    let sharedSourceTeardownInProgressPromise: Promise<unknown> | undefined;
    let nextPromise: Promise<IteratorResult<TValue, undefined | void>> | undefined;
    let activeSubIteratorsCount = 0;

    return {
      [Symbol.asyncIterator]() {
        let iteratorClosed = false;

        if (++activeSubIteratorsCount === 1) {
          sharedSourceIterator = srcIterable[Symbol.asyncIterator]();
        }

        // TODO: Should wrap each iterator's returned promise such that it can be immediately early-resolved to a "done" result when the iterator gets early-closed?

        return {
          async next() {
            if (sharedSourceTeardownInProgressPromise) {
              await sharedSourceTeardownInProgressPromise;
            }
            if (iteratorClosed) {
              return { done: true, value: undefined };
            }
            nextPromise ??= (() => {
              const currSharedSourceIterator = sharedSourceIterator;
              return currSharedSourceIterator.next().finally(() => {
                if (currSharedSourceIterator === sharedSourceIterator) {
                  nextPromise = undefined;
                }
              });
            })();
            return nextPromise;
          },

          async return() {
            if (!iteratorClosed) {
              iteratorClosed = true;
              if (--activeSubIteratorsCount === 0) {
                await (sharedSourceTeardownInProgressPromise = (async () => {
                  const currSharedSourceIterator = sharedSourceIterator;
                  if (sharedSourceTeardownInProgressPromise) {
                    await sharedSourceTeardownInProgressPromise;
                  }
                  try {
                    if (currSharedSourceIterator.return) {
                      await currSharedSourceIterator.return();
                    }
                  } finally {
                    if (currSharedSourceIterator === sharedSourceIterator) {
                      sharedSourceTeardownInProgressPromise = undefined;
                    }
                  }
                })());
              }
            }
            return { done: true, value: undefined };
          },
        };
      },
    };
  };
}

// function shareAsyncIter___<TNext>(): (source: AsyncIterable<TNext>) => AsyncIterable<TNext> {
//   return source => {
//     let activeIteratorCount = 0;
//     let currSourceIterator: AsyncIterator<TNext> | undefined;
//     let currPendingItemPromise: Promise<IteratorResult<TNext>> | undefined;

//     return {
//       [Symbol.asyncIterator]() {
//         let iteratorClosed = false;

//         const gen = (async function* () {
//           if (++activeIteratorCount === 1) {
//             currSourceIterator = source[Symbol.asyncIterator]();
//           }
//           try {
//             while (true) {
//               if (!currPendingItemPromise) {
//                 currPendingItemPromise = currSourceIterator!.next();
//                 (async () => {
//                   await currPendingItemPromise;
//                   currPendingItemPromise = undefined;
//                 })();
//               }

//               const next = await currPendingItemPromise;

//               if (next.done) {
//                 break;
//               }

//               yield next.value;
//             }
//           } finally {
//             if (!iteratorClosed) {
//               iteratorClosed = true;
//               if (--activeIteratorCount === 0) {
//                 await currSourceIterator!.return?.();
//               }
//             }
//           }
//         })();

//         const originalGenReturn = gen.return as unknown as () => Promise<
//           IteratorReturnResult<undefined | void>
//         >;

//         return Object.assign(gen, {
//           async return() {
//             if (!iteratorClosed) {
//               iteratorClosed = true;
//               if (--activeIteratorCount === 0) {
//                 await currSourceIterator!.return?.();
//               }
//             }
//             return await originalGenReturn.call(gen);
//           },
//         });
//       },
//     };
//   };
// }
