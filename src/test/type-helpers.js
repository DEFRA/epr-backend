import { expect } from 'vitest'

/**
 * Asserts a value is present (not null or undefined) and narrows its type for
 * subsequent access. Use where tsc needs narrowing that
 * `expect(...).toBeDefined()` alone does not provide (e.g. `.find()` results,
 * `findOne()`/`validate()` returns).
 *
 * @template T
 * @param {T} value
 * @returns {asserts value is NonNullable<T>}
 */
export function assertPresent(value) {
  expect(value).toBeDefined()
  expect(value).not.toBeNull()
}

/**
 * Wraps a deliberately-invalid value so it satisfies the parameter type it is
 * passed into. For tests that exercise runtime guards with inputs the type
 * system forbids (null, undefined, wrong shape). The return type is inferred
 * from the call position, so no cast noise leaks into the test body:
 *
 *   expect(() => parse(invalidArg(null))).toThrow()
 *
 * `T` is inferred purely from the call position, so use it only where a target
 * type exists (an argument slot or an annotated assignment). With no context
 * `T` falls back to `unknown` and the wrapper is a no-op.
 *
 * @template T
 * @param {unknown} value
 * @returns {T}
 */
export const invalidArg = (value) => /** @type {T} */ (value)

/**
 * Wraps a partial test double so it satisfies the full type it stands in for,
 * while still type-checking the properties you do supply against that type.
 * Prefer this over an `unknown` cast for partial mocks: the target type is
 * inferred from the assignment, so misspelled or wrongly-typed properties are
 * still caught.
 *
 *   \@type {FormSubmissionsRepository}
 *   let repo
 *   repo = partialMock({ findAllOrganisations: vi.fn() })
 *
 * Requires a target type to infer `T` from (an annotated variable/const or an
 * argument slot). Without one, `T` is `unknown`, `Partial<unknown>` is `{}`, and
 * every property check is silently lost. Note the check is shallow: nested
 * required fields (e.g. a `User` inside the double) are still enforced, so a
 * deeply-partial double needs an `unknown` cast, not partialMock.
 *
 * @template T
 * @param {Partial<NoInfer<T>>} value
 * @returns {T}
 */
export const partialMock = (value) => /** @type {T} */ (value)
