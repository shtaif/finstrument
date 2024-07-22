import { once } from 'node:events';
import { z } from 'zod';
import { WebSocket, WebSocketServer, type RawData, type ServerOptions } from 'ws';
import { itMap, itSwitchMap, itTakeUntil } from 'iterable-operators';
import { pipe } from 'shared-utils';
import { itOnNodeEvent } from '../utils/itOnNodeEvent.js';
import { observeMarketData } from '../utils/observeMarketData/index.js';

export { listenWebSocketApp };

function listenWebSocketApp(opts: Omit<ServerOptions, 'path'>): WebSocketServer {
  const webSocketApp = new WebSocketServer({
    ...opts,
    path: '/market-data',
  });

  webSocketApp.on('connection', async ws => {
    const outgoingMessages = pipe(
      itOnNodeEvent<[RawData]>(ws, 'message'),
      itMap(([msg]) =>
        pipe(
          msg.toString('utf-8'),
          msgDecoded => JSON.parse(msgDecoded),
          parsedMsg => marketDataInboundMessageSchema.parse(parsedMsg)
        )
      ),
      itSwitchMap(({ symbols }) => observeMarketData({ symbols })),
      itTakeUntil(once(ws, 'close') /*Promise.race([once(ws, 'close'), once(ws, 'error')])*/)
    );

    try {
      // await new Promise(resolve => setTimeout(resolve, 1000));
      for await (const symbolMarketData of outgoingMessages) {
        console.log(JSON.stringify(symbolMarketData, undefined, 2));
        await wsSendJsonPromisified(
          ws,
          {
            success: true,
            data: symbolMarketData,
          },
          { compress: true }
        );
      }
    } catch (err: any) {
      console.error(err);
      await wsSendJsonPromisified(
        ws,
        {
          success: false,
          data: { message: err.message },
        },
        { compress: true }
      );
    }
  });

  return webSocketApp;
}

const marketDataInboundMessageSchema = z.object({
  symbols: z
    .array(z.string())
    .transform(symbols => symbols.map(symbol => symbol.trim()).filter(Boolean)),
});

async function wsSendJsonPromisified(
  ws: WebSocket,
  data: unknown,
  opts: Parameters<WebSocket['send']>[1] = {}
) {
  const serialized = JSON.stringify(data);
  await new Promise<void>((resolve, reject) => {
    ws.send(serialized, opts, err => (err ? reject(err) : resolve()));
  });
}
