const pipe: PipeFunction = (
  initVal: unknown,
  ...funcs: ((...args: any[]) => any)[]
) => {
  return funcs.reduce((currVal, nextFunc) => nextFunc(currVal), initVal);
};

export default pipe;

interface PipeFunction {
  <INIT_VAL>(initVal: INIT_VAL): INIT_VAL;

  <INIT_VAL, A>(initVal: INIT_VAL, ...funcs: [(arg: INIT_VAL) => A]): A;

  <INIT_VAL, A, B>(
    initVal: INIT_VAL,
    ...funcs: [(arg: INIT_VAL) => A, (arg: A) => B]
  ): B;

  <INIT_VAL, A, B, C>(
    initVal: INIT_VAL,
    ...funcs: [(arg: INIT_VAL) => A, (arg: A) => B, (arg: B) => C]
  ): C;

  <INIT_VAL, A, B, C, D>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D
    ]
  ): D;

  <INIT_VAL, A, B, C, D, E>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E
    ]
  ): E;

  <INIT_VAL, A, B, C, D, E, F>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F
    ]
  ): F;

  <INIT_VAL, A, B, C, D, E, F, G>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G
    ]
  ): G;

  <INIT_VAL, A, B, C, D, E, F, G, H>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H
    ]
  ): H;

  <INIT_VAL, A, B, C, D, E, F, G, H, I>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H,
      (arg: H) => I
    ]
  ): I;

  <INIT_VAL, A, B, C, D, E, F, G, H, I, J>(
    initVal: INIT_VAL,
    ...funcs: [
      (arg: INIT_VAL) => A,
      (arg: A) => B,
      (arg: B) => C,
      (arg: C) => D,
      (arg: D) => E,
      (arg: E) => F,
      (arg: F) => G,
      (arg: G) => H,
      (arg: H) => I,
      (arg: I) => J
    ]
  ): J;
}
