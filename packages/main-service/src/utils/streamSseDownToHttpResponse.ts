import http from 'http';
import express from 'express';
import { asyncMap, execPipe as pipe } from 'iter-tools';
import { catchError } from '@reactivex/ix-esnext-esm/asynciterable/operators';
import { createSession as sseCreateSession } from 'better-sse';
import type { Session as SseSession } from 'better-sse';

export { streamSseDownToHttpResponse as default };

async function streamSseDownToHttpResponse(
  req: express.Request,
  res: express.Response,
  dataIterable: AsyncIterable<unknown>,
  sseChannelOpts: Record<string, any> = {}
) {
  let sseSession: SseSession;
  let dataIterator: AsyncIterator<unknown> | undefined;

  try {
    try {
      dataIterator = dataIterable[Symbol.asyncIterator]();
      sseSession = await sseCreateSession(req, res, sseChannelOpts);
    } catch (err) {
      res.status(500).end();
      throw err;
    }

    await Promise.race([
      pipe(
        { [Symbol.asyncIterator]: () => dataIterator! },
        asyncMap(dataMessage => ({ success: true, data: dataMessage }) as const),
        catchError(async function* (err) {
          yield { success: false, data: { ...err, message: err.message } } as const;
          throw err;
        }),
        iter => sseSession.iterate(iter, { eventName: 'message' })
      ),
      onRequestClosedByClient(req),
      rejectOnRequestErrorOtherThanConnReset(req),
    ]);
  } catch (err) {
    console.error(err);
  } finally {
    await dataIterator?.return?.();
    res.end();
  }
}

async function onRequestClosedByClient(req: http.IncomingMessage) {
  await new Promise(resolve => req.once('close', resolve));
  // try {
  //   await once(req, 'close');
  // } catch (err) {
  //   if (err.code !== 'ECONNRESET') {
  //     throw err;
  //   }
  // }
}

async function rejectOnRequestErrorOtherThanConnReset(req: http.IncomingMessage) {
  const err = await new Promise(resolve => req.once('error', resolve));
  if ((err as any).code !== 'ECONNRESET') {
    throw err;
  }
}
