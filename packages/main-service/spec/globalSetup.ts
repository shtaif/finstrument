import config from './vitest.config.js';

export { setup };

async function setup() {
  Object.assign(process.env, config.test.env); // manually patch env vars configured via vitest's config files since vitest weirdly doesn't seem to apply those while running global setup files such as this
  return async () => {};
}
