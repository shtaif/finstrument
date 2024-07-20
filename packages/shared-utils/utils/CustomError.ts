export { CustomError };

class CustomError<
  T extends {
    message: string;
  },
> extends Error {
  constructor(contents: T) {
    super(contents.message);

    Object.assign(this, contents);

    Object.defineProperty(this, 'name', {
      enumerable: false,
      configurable: false,
      value: this.constructor.name,
    });

    (Error as any).captureStackTrace(this, this.constructor);
  }
}
