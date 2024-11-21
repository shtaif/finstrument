import { type ExtractAsyncIterableValue } from './ExtractAsyncIterableValue.js';

export { itCombineLatest };

function itCombineLatest<TSourceIters extends AsyncIterable<unknown>[]>(
  ...sources: TSourceIters
): AsyncIterable<{
  [I in keyof TSourceIters]: ExtractAsyncIterableValue<TSourceIters[I]>;
}>;
function itCombineLatest<T>(...sources: AsyncIterable<T>[]): AsyncIterable<(T | undefined)[]> {
  return {
    [Symbol.asyncIterator]() {
      let remainingActiveItems: SourceStateItem<T>[] = sources.map((source, i) => ({
        idxInSources: i,
        iterator: source[Symbol.asyncIterator](),
        pendingPromise: undefined,
        mostRecentValue: undefined as any,
      }));

      const iterator = (async function* () {
        const latestValues: (T | undefined)[] = new Array(sources.length).fill(undefined);

        try {
          await Promise.all(remainingActiveItems.map(itemFetchNextIfNotPending));

          remainingActiveItems = remainingActiveItems.filter(it => !it.mostRecentValue.done);

          remainingActiveItems.forEach(
            it => (latestValues[it.idxInSources] = it.mostRecentValue.value)
          );

          if (!remainingActiveItems.length) {
            return;
          }

          yield latestValues;

          do {
            const firstToResolve = await Promise.race(
              remainingActiveItems.map(itemFetchNextIfNotPending)
            );

            if (!firstToResolve.mostRecentValue.done) {
              latestValues[firstToResolve.idxInSources] = firstToResolve.mostRecentValue.value;
              yield latestValues;
            } else {
              remainingActiveItems.splice(remainingActiveItems.indexOf(firstToResolve), 1);
            }
          } while (remainingActiveItems.length);
        } catch (err) {
          await Promise.all(remainingActiveItems.map(it => it.iterator.return?.()));
          throw err;
        }
      })();

      iterator.return = async function () {
        await Promise.all(remainingActiveItems.map(it => it.iterator.return?.()));
        return { done: true, value: undefined };
      };

      return iterator;
    },
  };
}

function itemFetchNextIfNotPending<T>(item: SourceStateItem<T>): Promise<SourceStateItem<T>> {
  item.pendingPromise ??= (async () => {
    const next = await item.iterator.next();
    item.mostRecentValue = next;
    item.pendingPromise = undefined;
    return item;
  })();
  return item.pendingPromise;
}

type SourceStateItem<T> = {
  idxInSources: number;
  iterator: AsyncIterator<T>;
  pendingPromise: undefined | Promise<SourceStateItem<T>>;
  mostRecentValue: IteratorResult<T>;
};
