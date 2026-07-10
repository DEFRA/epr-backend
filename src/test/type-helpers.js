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
export const assertPresent = (value) => {
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
 * @template T
 * @param {Partial<NoInfer<T>>} value
 * @returns {T}
 */
export const partialMock = (value) => /** @type {T} */ (value)
