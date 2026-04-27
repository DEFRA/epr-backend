/**
 * Pino `err` serializer that mirrors the transformation `@elastic/ecs-pino-format`
 * applies before logs reach OpenSearch. Extracted so tests can apply the same
 * transform when validating log shapes against the CDP schema.
 *
 * Emits only fields in the CDP indexed-fields allowlist (message, stack_trace,
 * type, code). The `.cause` chain is not surfaced — `error.cause.*` is not in
 * the allowlist, so cause classifiers must be encoded into `error.code` or
 * `event.reason` at the throw site instead (see fetch-json.js, mongodb.js).
 *
 * @param {unknown} err
 */
export const errSerializer = (err) => {
  if (!(err instanceof Error)) {
    return err
  }

  /** @type {Record<string, unknown>} */
  const errorObj = {
    message: err.message,
    stack_trace: err.stack,
    type: err.name
  }

  // @ts-ignore - err.code is a convention on Error subclasses
  if (err.code) {
    // @ts-ignore
    errorObj.code = err.code
  }

  return errorObj
}
