import { asyncMap } from 'iter-tools';
import { myIterableCleanupPatcher } from './myIterableCleanupPatcher.js';

export { itMap };

function itMap<TValue, TMappedValue>(
  mapFn: (val: TValue, i: number) => TMappedValue | Promise<TMappedValue>
): (source: AsyncIterable<TValue>) => AsyncIterable<TMappedValue> {
  return myIterableCleanupPatcher(asyncMap(mapFn));
}
