import { normaliseStoredSummaryLog } from './normalise-load-row-ids.js'

const category = (rowIds) => ({ count: rowIds.length, rowIds })

const validity = ({
  valid = [],
  invalid = [],
  included = [],
  excluded = []
} = {}) => ({
  valid: category(valid),
  invalid: category(invalid),
  included: category(included),
  excluded: category(excluded)
})

const loads = ({ added = {}, unchanged = {}, adjusted = {} } = {}) => ({
  added: validity(added),
  unchanged: validity(unchanged),
  adjusted: validity(adjusted)
})

const summaryLogWith = (loadsValue) => ({
  status: 'submitted',
  loads: loadsValue
})

describe('normaliseStoredSummaryLog', () => {
  it('converts numeric row IDs to their string form', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(loads({ added: { valid: [1000] } }))
    )

    expect(result.loads.added.valid.rowIds).toEqual(['1000'])
  })

  it('leaves string row IDs untouched', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(loads({ added: { valid: ['row-2'] } }))
    )

    expect(result.loads.added.valid.rowIds).toEqual(['row-2'])
  })

  it('normalises a mixed list, preserving order', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(loads({ added: { valid: [1000, 'row-2', 1002] } }))
    )

    expect(result.loads.added.valid.rowIds).toEqual(['1000', 'row-2', '1002'])
  })

  it('normalises every validity bucket of every change category', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(
        loads({
          added: { valid: [1], invalid: [2], included: [3], excluded: [4] },
          unchanged: { valid: [5], invalid: [6], included: [7], excluded: [8] },
          adjusted: {
            valid: [9],
            invalid: [10],
            included: [11],
            excluded: [12]
          }
        })
      )
    )

    expect(result.loads).toEqual(
      loads({
        added: {
          valid: ['1'],
          invalid: ['2'],
          included: ['3'],
          excluded: ['4']
        },
        unchanged: {
          valid: ['5'],
          invalid: ['6'],
          included: ['7'],
          excluded: ['8']
        },
        adjusted: {
          valid: ['9'],
          invalid: ['10'],
          included: ['11'],
          excluded: ['12']
        }
      })
    )
  })

  it('preserves the count alongside the normalised row IDs', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(loads({ added: { valid: [1000, 1001] } }))
    )

    expect(result.loads.added.valid.count).toBe(2)
  })

  it('leaves empty row ID lists empty', () => {
    const result = normaliseStoredSummaryLog(summaryLogWith(loads()))

    expect(result.loads.added.valid.rowIds).toEqual([])
  })

  it('leaves the rest of the summary log untouched', () => {
    const result = normaliseStoredSummaryLog(
      summaryLogWith(loads({ added: { valid: [1000] } }))
    )

    expect(result.status).toBe('submitted')
  })

  it('returns a summary log without loads unchanged', () => {
    /** @type {{ status: string, loads?: unknown }} */
    const summaryLog = { status: 'validating' }

    expect(normaliseStoredSummaryLog(summaryLog)).toBe(summaryLog)
  })

  it('does not mutate the summary log it was given', () => {
    const summaryLog = summaryLogWith(loads({ added: { valid: [1000] } }))

    normaliseStoredSummaryLog(summaryLog)

    expect(summaryLog.loads.added.valid.rowIds).toEqual([1000])
  })
})
