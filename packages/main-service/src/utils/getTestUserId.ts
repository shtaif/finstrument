import { UserModel } from '../db/index.js';

export { getTestUserId };

async function getTestUserId(): Promise<string> {
  cachedDbFetchPromise ??= UserModel.findOne({
    where: { alias: 'dorshtaif' },
  });
  const testUser = await cachedDbFetchPromise;
  return testUser!.id;
}

let cachedDbFetchPromise: undefined | Promise<UserModel | null>;
