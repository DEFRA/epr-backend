import { expect } from 'vitest'
import { ROW_OUTCOME } from '../validation-pipeline.js'

/**
 * Asserts a waste-balance classification result is the INCLUDED variant and
 * returns it narrowed, so callers can read `transactionAmount` / `reasons`
 * without a discriminated-union type error. Fails the test (via `expect`) when
 * the outcome is anything other than INCLUDED.
 *
 * @template {{ outcome: string }} T
 * @param {T} result
 * @returns {Extract<T, { outcome: typeof ROW_OUTCOME.INCLUDED }>}
 */
export const assertIncluded = (result) => {
  expect(result.outcome).toBe(ROW_OUTCOME.INCLUDED)

  return /** @type {Extract<T, { outcome: typeof ROW_OUTCOME.INCLUDED }>} */ (
    result
  )
}
