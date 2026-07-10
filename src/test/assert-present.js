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
