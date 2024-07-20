(src): AsyncIterable<any> => ({
  [Symbol.asyncIterator]() {
    let it: AsyncIterator<any> | undefined;
    return {
      async next() {
        it ??= src[Symbol.asyncIterator]();
        const item = await it!.next();
        return item;
      },
      async return() {
        if (!it?.return) {
          return { done: true, value: undefined };
        }
        return it.return();
      },
    };
  },
})
