export { objectCreateNullProto };

function objectCreateNullProto<T extends { [k: string]: unknown }>(): T {
  return Object.create(null);
}
