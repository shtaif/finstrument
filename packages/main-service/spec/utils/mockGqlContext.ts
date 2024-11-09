import { vi, type MockInstance } from 'vitest';
import { asyncPipe } from 'shared-utils';
import * as appGqlContextMod from '../../src/initGqlSchema/appGqlContext.js';

export { mockGqlContext, unmockGqlContext };

function mockGqlContext(
  ctxOverrideFn: (
    origAppCtx: appGqlContextMod.AppGqlContextValue
  ) => appGqlContextMod.AppGqlContextValue
): void {
  appGqlContextSpy?.mockReset();
  appGqlContextSpy = vi
    .spyOn(appGqlContextMod, 'appGqlContext')
    .mockImplementation(async originalAppCtxInjectedArg => {
      return await asyncPipe(originalAppCtxInjectedArg, origAppGqlContextBuildFn, ctxOverrideFn);
    });
}

function unmockGqlContext(): void {
  appGqlContextSpy?.mockRestore();
  appGqlContextSpy = undefined;
}

const origAppGqlContextBuildFn = appGqlContextMod.appGqlContext;

let appGqlContextSpy: undefined | MockInstance<typeof origAppGqlContextBuildFn>;
