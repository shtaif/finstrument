export { pipe };

const pipe: PipeFunction = (initVal: unknown, ...funcs: ((...args: any[]) => any)[]) => {
  return funcs.reduce((currVal, nextFunc) => nextFunc(currVal), initVal);
};

interface PipeFunction {
  <TInitVal>(initVal: TInitVal): TInitVal;

  <TInitVal, A>(initVal: TInitVal, ...funcs: [(arg: TInitVal) => A]): A;

  <TInitVal, A, B>(initVal: TInitVal, ...funcs: [(arg: TInitVal) => A, (arg: A) => B]): B;

  <TInitVal, A, B, C>(
    initVal: TInitVal,
    ...funcs: [(arg: TInitVal) => A, (arg: A) => B, (arg: B) => C]
  ): C;

  <TInitVal, A, B, C, D>(
    initVal: TInitVal,
    ...funcs: [(arg: TInitVal) => A, (arg: A) => B, (arg: B) => C, (arg: C) => D]
  ): D;

  <TInitVal, A, B, C, D, E>(
    initVal: TInitVal,
    ...funcs: [(arg: TInitVal) => A, (arg: A) => B, (arg: B) => C, (arg: C) => D, (arg: D) => E]
  ): E;

  <TInitVal, A, B, C, D, E, F>(
    initVal: TInitVal,
    ...funcs: [
      (arg: TInitVal) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
    ]
  ): F;

  <TInitVal, A, B, C, D, E, F, G>(
    initVal: TInitVal,
    ...funcs: [
      (arg: TInitVal) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
    ]
  ): G;

  <TInitVal, A, B, C, D, E, F, G, H>(
    initVal: TInitVal,
    ...funcs: [
      (arg: TInitVal) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H,
    ]
  ): H;

  <TInitVal, A, B, C, D, E, F, G, H, I>(
    initVal: TInitVal,
    ...funcs: [
      (arg: TInitVal) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H,
      (arg: H) => I,
    ]
  ): I;

  <TInitVal, A, B, C, D, E, F, G, H, I, J>(
    initVal: TInitVal,
    ...funcs: [
      (arg: TInitVal) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H,
      (arg: H) => I,
      (arg: I) => J,
    ]
  ): J;
}
