import { iterified } from 'iterified';
// import { fromEvent } from 'ix/asynciterable/fromevent';
// import shareAsyncIter from './shareAsyncIter';
// import pipe from './pipe';

export default sseJsonIterable;

function sseJsonIterable<T>(url: string | URL, options?: EventSourceInit): AsyncIterable<T> {
  return iterified<T>((next, _, error) => {
    const eventSource = new EventSource(url, options);

    const messageListener = (event: MessageEvent<string>) => {
      const parsedData = JSON.parse(event.data);
      next(parsedData);
    };

    const errorListener = (_event: Event) => {
      error(new Error('Event source connection closed by server')); // TODO: Verify the error that's pushed here...
    };

    eventSource.addEventListener('message', messageListener); // TODO: Make the listened message "type" (represented by the event name listened to) configurable?...
    eventSource.addEventListener('error', errorListener);

    return () => {
      eventSource.removeEventListener('message', messageListener);
      eventSource.removeEventListener('error', errorListener);
      eventSource.close();
    };
  });
}

// function sseJsonIterable<T>(url: string | URL, options?: EventSourceInit): AsyncIterable<T> {
//   return pipe(
//     {
//       [Symbol.asyncIterator]: () => {
//         let eventSource: EventSource;

//         const eventSourceGen = (async function* () {
//           // TODO: Make the listened message "type" (represented by the event name listened to) configurable?...
//           eventSource = new EventSource(url, options);
//           yield* fromEvent<T>(eventSource, 'message', event => JSON.parse(event.data));
//         })();

//         return {
//           next: () => eventSourceGen.next(),
//           return: async () => {
//             eventSource?.close();
//             eventSourceGen?.return!();
//             return {
//               done: true,
//               value: undefined,
//             };
//           },
//         };
//       },
//     },
//     iter => shareAsyncIter(iter)
//   );
// }
