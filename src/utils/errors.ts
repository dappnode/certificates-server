export class HttpError extends Error {
  constructor(
    message: string,
    public readonly code: number
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message: string) {
    super(message, 400);
  }
}
