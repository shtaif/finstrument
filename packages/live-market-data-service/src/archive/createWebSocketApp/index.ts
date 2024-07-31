// import {
//   App as UWebSocketsApp,
//   DEDICATED_COMPRESSOR_4KB,
//   type TemplatedApp,
//   type WebSocket,
//   type AppOptions,
// } from 'uWebSockets.js';
// import { entries } from 'from 'lodash-es';
// import { pipe } from 'shared-utils';
// import { iterifiedUnwrapped, type IterifiedIterable, type IterifiedUnwrapped } from 'iterified';

// export { createWebSocketApp, type RouteHandlerFn, type AppOptions };

// function createWebSocketApp(
//   appOpts: AppOptions | undefined,
//   routeHandlers: {
//     [routePattern: string]: RouteHandlerFn;
//   }
// ): TemplatedApp {
//   const incomingMessageIterables = new WeakMap<
//     WebSocket<unknown>,
//     {
//       incoming: IterifiedUnwrapped<unknown, void | undefined>;
//       outgoingIterator: AsyncIterator<unknown>;
//       terminated: boolean;
//     }
//   >();

//   const utf8Decoder = new TextDecoder('utf-8');

//   const uwsApp = UWebSocketsApp(appOpts ?? {});

//   for (const [route, handlerFn] of entries(routeHandlers)) {
//     uwsApp.ws(route, {
//       maxBackpressure: 1024 * 128,
//       idleTimeout: 0,
//       // maxPayloadLength: 512,
//       compression: DEDICATED_COMPRESSOR_4KB,

//       open: async ws => {
//         const wsConnTraffic = {
//           incoming: iterifiedUnwrapped<unknown>(),
//           outgoingIterator: undefined! as AsyncIterator<unknown>,
//           terminated: false,
//         };

//         incomingMessageIterables.set(ws, wsConnTraffic);

//         wsConnTraffic.outgoingIterator = pipe(
//           wsConnTraffic.incoming.iterable,
//           incomingIter => handlerFn(ws, incomingIter),
//           outgoingIter => outgoingIter[Symbol.asyncIterator]()
//         );

//         try {
//           for await (const parsedMsg of {
//             [Symbol.asyncIterator]: () => wsConnTraffic.outgoingIterator,
//           }) {
//             pipe(
//               parsedMsg,
//               parsedMsg => ({ success: true, data: parsedMsg }),
//               JSON.stringify,
//               serializedPayload => {
//                 if (!wsConnTraffic.terminated) {
//                   /*const resultCode = */ ws.send(serializedPayload, false, true);
//                   // console.log({
//                   //   resultCode,
//                   //   parsedMessage: parsedMsg,
//                   // });
//                 }
//               }
//             );
//           }
//         } catch (err: any) {
//           console.error(err);
//           if (!wsConnTraffic.terminated) {
//             /*const resultCode = */ pipe(
//               { success: false, data: {} },
//               JSON.stringify,
//               serializedPayload => ws.send(serializedPayload, false, true)
//             );
//           }
//         }
//       },

//       close: async (ws, _code, _message) => {
//         const wsTraffic = incomingMessageIterables.get(ws)!;
//         wsTraffic.outgoingIterator.return?.();
//         wsTraffic.incoming.done();
//         wsTraffic.terminated = true;
//         incomingMessageIterables.delete(ws)!;
//       },

//       message: (ws, message, _isBinary) => {
//         try {
//           incomingMessageIterables.get(ws)!.incoming.next(
//             pipe(
//               message,
//               message => utf8Decoder.decode(message),
//               payload => JSON.parse(payload)
//             )
//           );
//         } catch (err) {
//           // TODO: Handle message parsing errors here...
//           console.error(err);
//           throw err;
//         }
//       },
//     });
//   }

//   return uwsApp;
// }

// type RouteHandlerFn = (
//   ws: WebSocket<unknown>,
//   incomingMessages: IterifiedIterable<unknown>
// ) => AsyncIterable<unknown>;

// /*
//   Usage:

//   // const uwsApp = createWebSocketApp({}, appWsHandlers);

//   // ...

//   // await new Promise<void>((resolve, reject) =>
//   //   uwsApp.listen(env.WS_PORT, listenSocket => {
//   //     if (listenSocket) {
//   //       resolve();
//   //     } else {
//   //       reject(listenSocket);
//   //     }
//   //   })
//   // ),

//   // ...

//   // uwsApp.close();
// */
