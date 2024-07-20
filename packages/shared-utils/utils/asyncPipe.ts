export { asyncPipe };

const asyncPipe: AsyncPipeFunction = async (
  initVal: unknown,
  ...funcs: ((...args: any[]) => any)[]
) => {
  let currVal = await initVal;
  for (let i = 0; i < funcs.length; ++i) {
    currVal = await funcs[i](currVal);
  }
  return currVal;
};

interface AsyncPipeFunction {
  <INIT_VAL>(initVal: INIT_VAL): Promise<INIT_VAL>;

  <INIT_VAL, A>(initVal: INIT_VAL, ...funcs: [(arg: Awaited<INIT_VAL>) => A]): Promise<A>;

  <INIT_VAL, A, B>(
    initVal: INIT_VAL,
    ...funcs: [(arg: Awaited<INIT_VAL>) => A, (arg: Awaited<A>) => B]
  ): Promise<B>;

  <INIT_VAL, A, B, C>(
    initVal: INIT_VAL,
    ...funcs: [(arg: Awaited<INIT_VAL>) => A, (arg: Awaited<A>) => B, (arg: Awaited<B>) => C]
  ): Promise<C>;

  <INIT_VAL, A, B, C, D>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
    ]
  ): Promise<D>;

  <INIT_VAL, A, B, C, D, E>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
    ]
  ): Promise<E>;

  <INIT_VAL, A, B, C, D, E, F>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
      (arg: Awaited<E>) => F,
    ]
  ): Promise<F>;

  <INIT_VAL, A, B, C, D, E, F, G>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
      (arg: Awaited<E>) => F,
      (arg: Awaited<F>) => G,
    ]
  ): Promise<G>;

  <INIT_VAL, A, B, C, D, E, F, G, H>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
      (arg: Awaited<E>) => F,
      (arg: Awaited<F>) => G,
      (arg: Awaited<G>) => H,
    ]
  ): Promise<H>;

  <INIT_VAL, A, B, C, D, E, F, G, H, I>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
      (arg: Awaited<E>) => F,
      (arg: Awaited<F>) => G,
      (arg: Awaited<G>) => H,
      (arg: Awaited<H>) => I,
    ]
  ): Promise<I>;

  <INIT_VAL, A, B, C, D, E, F, G, H, I, J>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: Awaited<INIT_VAL>) => A,
      (arg: Awaited<A>) => B,
      (arg: Awaited<B>) => C,
      (arg: Awaited<C>) => D,
      (arg: Awaited<D>) => E,
      (arg: Awaited<E>) => F,
      (arg: Awaited<F>) => G,
      (arg: Awaited<G>) => H,
      (arg: Awaited<H>) => I,
      (arg: Awaited<I>) => J,
    ]
  ): Promise<J>;
}
