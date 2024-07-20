import { pairwise as ixPairwise } from '@reactivex/ix-esnext-esm/asynciterable/operators';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itPairwise };

// function itPairwise<TSource>(): (source: AsyncIterable<TSource>) => AsyncIterable<TSource[]> {
function itPairwise<TSource>(): (
  source: AsyncIterable<TSource>
) => AsyncIterable<[TSource, TSource]> {
  return myIterableCleanupPatcher(ixPairwise<TSource>()) as (
    source: AsyncIterable<TSource>
  ) => AsyncIterable<[TSource, TSource]>;
}
