import { on } from 'node:events';
import { iterified } from 'iterified';

export { itOnNodeEvent };

function itOnNodeEvent<TValues extends unknown[] = any[]>(
  emitter: NodeJS.EventEmitter,
  eventName: string
): AsyncIterable<TValues> {
  return iterified<TValues>((next, done, error) => {
    const abortCtrl = new AbortController();

    (async () => {
      const emissions = on(emitter, eventName, {
        signal: abortCtrl.signal,
      });

      try {
        for await (const emission of emissions) {
          next(emission);
        }
      } catch (err: any) {
        if (err.code === 'ABORT_ERR') {
          done();
        } else {
          error(err);
        }
      }
    })();

    return () => abortCtrl.abort();
  });
}
