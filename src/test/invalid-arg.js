/**
 * Wraps a deliberately-invalid value so it satisfies the parameter type it is
 * passed into. For tests that exercise runtime guards with inputs the type
 * system forbids (null, undefined, wrong shape). The return type is inferred
 * from the call position, so no cast noise leaks into the test body:
 *
 *   expect(() => parse(invalidArg(null))).toThrow()
 *
 * @template T
 * @param {unknown} value
 * @returns {T}
 */
export const invalidArg = (value) => /** @type {T} */ (value)
