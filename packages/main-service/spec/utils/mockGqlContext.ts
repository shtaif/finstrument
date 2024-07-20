import { vi, type MockInstance } from 'vitest';
import * as appGqlContextMod from '../../src/initGqlSchema/appGqlContext.js';

export { mockGqlContext, unmockGqlContext };

const origAppGqlContext = appGqlContextMod.appGqlContext;

let appGqlContextSpy:
  | MockInstance<(driverInjectedContext: {}) => Promise<appGqlContextMod.AppGqlContextValue>>
  | undefined;

function mockGqlContext(overrideProps: Partial<appGqlContextMod.AppGqlContextValue> = {}): void {
  appGqlContextSpy = vi.spyOn(appGqlContextMod, 'appGqlContext');
  appGqlContextSpy.mockImplementation(async (...args) => ({
    ...(await origAppGqlContext(...args)),
    ...overrideProps,
  }));
}

function unmockGqlContext(): void {
  appGqlContextSpy?.mockRestore();
}
