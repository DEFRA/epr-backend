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
 * @param {StoredLoads} loads
 */
const normaliseLoadRowIds = (loads) =>
  Object.fromEntries(
    CHANGES.map((change) => [change, normaliseValidity(loads[change])])
  )

/**
 * Summary logs written before ROW_ID coercion landed hold row IDs as numbers
 * rather than strings. Coercing them as the document leaves storage lets those
 * documents stay as they are while every reader sees the string form the
 * summary log model declares.
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
