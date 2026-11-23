export class RatesApiError extends Error {
  readonly status?: number;

  constructor(message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "RatesApiError";
    if (options.status !== undefined) this.status = options.status;
  }
}
