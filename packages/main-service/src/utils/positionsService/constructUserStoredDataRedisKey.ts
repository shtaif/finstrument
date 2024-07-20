export default constructUserStoredDataRedisKey;

function constructUserStoredDataRedisKey(userAlias: string): string {
  return `user-stored-data:${userAlias}`;
}
