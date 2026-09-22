/**
 * The plugin's single failure vocabulary.
 *
 * It lives in its own module because both halves of the route layer need it —
 * the handlers raise it, the transport maps it to a status line — and a cycle
 * between those two files would be worse than one tiny module.
 *
 * The fields are assigned explicitly rather than declared as constructor
 * parameter properties: Node's native type stripping, which is how this repo's
 * tests run with no bundler in between, rejects that one TypeScript construct,
 * and the route layer has to stay importable from a test.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}
