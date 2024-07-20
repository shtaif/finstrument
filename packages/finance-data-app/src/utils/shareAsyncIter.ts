export default shareAsyncIter;

function shareAsyncIter<TValue>(): (srcIterable: AsyncIterable<TValue>) => AsyncIterable<TValue> {
  return srcIterable => {
    let sharedSourceIterator: AsyncIterator<TValue>;
    let nextPromise: Promise<IteratorResult<TValue, undefined | void>> | undefined;
    let activeIteratorsCount = 0;

    return {
      [Symbol.asyncIterator]() {
        activeIteratorsCount++;

        if (activeIteratorsCount === 1) {
          sharedSourceIterator = srcIterable[Symbol.asyncIterator]();
        }

        return {
          next() {
            nextPromise ??= sharedSourceIterator.next().finally(() => (nextPromise = undefined));
            return nextPromise;
          },

          return: !sharedSourceIterator.return
            ? undefined
            : async () => {
                return --activeIteratorsCount > 0
                  ? { done: true, value: undefined }
                  : sharedSourceIterator.return!();
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
