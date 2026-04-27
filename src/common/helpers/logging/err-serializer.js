/**
 * Pino `err` serializer that mirrors the transformation `@elastic/ecs-pino-format`
 * applies before logs reach OpenSearch. Extracted so tests can apply the same
 * transform when validating log shapes against the CDP schema.
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

  // Surface bounded classifiers from the .cause chain — name and code are
  // enum-shaped identifiers (ECONNREFUSED, AbortError, etc.) that classify
  // the failure without leaking cause.message or cause.stack content.
  if (err.cause instanceof Error) {
    const cause = /** @type {Error & { code?: string | number }} */ (err.cause)
    errorObj.cause = {
      type: cause.name,
      code: cause.code
    }
  }

  return errorObj
}
