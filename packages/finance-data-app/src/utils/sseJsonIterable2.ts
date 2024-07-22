import { fromEvent } from 'ix/asynciterable/fromevent';
import { map } from 'ix/asynciterable/operators/map';
import { merge } from 'ix/asynciterable/merge';
import shareAsyncIter from './shareAsyncIter';
import pipe from './pipe';

export default sseJsonIterable2;

function sseJsonIterable2<T>(
  url: string | URL,
  options?: EventSourceInit
): AsyncIterable<
  | {
      type: 'open';
      originalEvent: unknown;
    }
  | {
      type: 'error';
      originalEvent: unknown;
    }
  | {
      type: 'message';
      data: T;
    }
> {
  return pipe(
    {
      [Symbol.asyncIterator]: () => {
        const eventSource = new EventSource(url, options);

        const openEvents = pipe(
          fromEvent(eventSource, 'open'),
          map(event => ({
            type: 'open' as const,
            originalEvent: event,
          }))
        );

        const errorEvents = pipe(
          fromEvent(eventSource, 'error'),
          map(event => ({
            type: 'error' as const,
            originalEvent: event,
          }))
        );

        const messageEvents = pipe(
          fromEvent(eventSource, 'message'),
          map((event: any) => ({
            type: 'message' as const,
            data: JSON.parse(event.data) as T,
          }))
        );

        const mergedEvents = merge(openEvents, errorEvents, messageEvents);

        // TODO: Make the listened message "type" (represented by the event name listened to) configurable?...

        const mergedEventsIterator = mergedEvents[Symbol.asyncIterator]();

        return {
          next: async () => mergedEventsIterator.next(),
          return: async () => {
            mergedEventsIterator.return!();
            eventSource.close();
            return {
              done: true as const,
              value: undefined,
            };
          },
        };
      },
    },
    shareAsyncIter()
  );
}
