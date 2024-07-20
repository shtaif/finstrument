import {
  iterified,
  iterifiedUnwrapped,
  type IterifiedIterable,
  type IterifiedIterator,
} from 'iterified';
import EventSource, { type EventSourceInitDict } from 'eventsource';

export { clientJsonSseToAsyncIterable as default };

function clientJsonSseToAsyncIterable<T = any>(params: {
  url: string;
  options?: EventSourceInitDict;
}): {
  [Symbol.asyncIterator]: () => IterifiedIterator<T>;
  messageEvents: IterifiedIterable<T>;
  openEvents: AsyncIterable<MessageEvent<any>>;
  closeEvents: AsyncIterable<MessageEvent<any>>;
} {
  const sseOpenEvents = iterifiedUnwrapped<MessageEvent<any>>();
  const sseCloseEvents = iterifiedUnwrapped<MessageEvent<any>>();

  const sseMessageEvents = iterified<T>((next, done, error) => {
    const es = new EventSource(params.url, params.options);

    const messageEventHandler = (ev: MessageEvent<any>) => {
      const msgParsed = JSON.parse(ev.data);
      next(msgParsed);
    };

    const openEventHandler = (ev: MessageEvent<any>) => {
      sseOpenEvents.next(ev);
    };

    const closeEventHandler = (ev: MessageEvent<any>) => {
      sseCloseEvents.next(ev);
      done();
    };

    const errorEventHandler = (ev: MessageEvent<any>) => {
      error(new Error(`Something went wrong: ${ev.toString()}`));
    };

    es.addEventListener('message', messageEventHandler);
    es.addEventListener('open', openEventHandler);
    es.addEventListener('close', closeEventHandler);
    es.addEventListener('error', errorEventHandler);

    return () => {
      es.removeEventListener('message', messageEventHandler);
      es.removeEventListener('open', openEventHandler);
      es.removeEventListener('close', closeEventHandler);
      es.removeEventListener('error', errorEventHandler);
      es.close();
    };
  });

  return {
    [Symbol.asyncIterator]: () => sseMessageEvents[Symbol.asyncIterator](),
    messageEvents: sseMessageEvents,
    openEvents: sseOpenEvents.iterable,
    closeEvents: sseCloseEvents.iterable,
  };
}
