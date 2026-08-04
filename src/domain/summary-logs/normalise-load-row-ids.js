/**
 * @typedef {{ count: number, rowIds: (string | number)[] }} StoredLoadCategory
 * @typedef {Record<'valid' | 'invalid' | 'included' | 'excluded', StoredLoadCategory>} StoredLoadValidity
 * @typedef {Record<'added' | 'unchanged' | 'adjusted', StoredLoadValidity>} StoredLoads
 */

const VALIDITIES = /** @type {const} */ ([
  'valid',
  'invalid',
  'included',
  'excluded'
])

const CHANGES = /** @type {const} */ (['added', 'unchanged', 'adjusted'])

/**
 * @param {StoredLoadValidity} validity
 */
const normaliseValidity = (validity) =>
  Object.fromEntries(
    VALIDITIES.map((name) => [
      name,
      { ...validity[name], rowIds: validity[name].rowIds.map(String) }
    ])
  )

/**
 * Summary logs written before ROW_ID coercion landed hold row IDs as numbers
 * rather than strings. Coercing them as they are read lets those documents stay
 * as they are while every reader sees the string form the contract promises.
 *
 * @template {StoredLoads | null | undefined} T
 * @param {T} loads
 * @returns {T}
 */
export const normaliseLoadRowIds = (loads) =>
  loads &&
  /** @type {any} */ (
    Object.fromEntries(
      CHANGES.map((change) => [change, normaliseValidity(loads[change])])
    )
  )

/**
 * Applies the same coercion to a summary log on its way out of storage, so
 * every reader sees the row ID type the domain model declares.
 *
 * @template {{ loads?: unknown }} T
 * @param {T} summaryLog
 * @returns {T}
 */
export const normaliseStoredSummaryLog = (summaryLog) =>
  summaryLog.loads
    ? {
        ...summaryLog,
        loads: normaliseLoadRowIds(
          /** @type {StoredLoads} */ (summaryLog.loads)
        )
      }
    : summaryLog
