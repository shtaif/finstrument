import { vi, type MockInstance } from 'vitest';
import { asyncPipe } from 'shared-utils';
import * as appGqlContextMod from '../../src/initGqlSchema/appGqlContext.js';

export { mockGqlContext, unmockGqlContext };

const origAppGqlContext = appGqlContextMod.appGqlContext;

let appGqlContextSpy: MockInstance<typeof appGqlContextMod.appGqlContext> | undefined;

function mockGqlContext(
  ctxOverrideFn: (
    origAppCtx: appGqlContextMod.AppGqlContextValue
  ) => appGqlContextMod.AppGqlContextValue
): void {
  appGqlContextSpy = vi.spyOn(appGqlContextMod, 'appGqlContext');
  appGqlContextSpy.mockImplementation(async originalAppCtxInjectedArg => {
    return await asyncPipe(originalAppCtxInjectedArg, origAppGqlContext, ctxOverrideFn);
  });
}

function unmockGqlContext(): void {
  appGqlContextSpy?.mockRestore();
}
