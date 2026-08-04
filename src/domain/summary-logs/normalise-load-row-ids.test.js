import { normaliseLoadRowIds } from './normalise-load-row-ids.js'

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

describe('normaliseLoadRowIds', () => {
  it('returns null for null loads', () => {
    expect(normaliseLoadRowIds(null)).toBeNull()
  })

  it('returns undefined for undefined loads', () => {
    expect(normaliseLoadRowIds(undefined)).toBeUndefined()
  })

  it('converts numeric row IDs to their string form', () => {
    const result = normaliseLoadRowIds(loads({ added: { valid: [1000] } }))

    expect(result.added.valid.rowIds).toEqual(['1000'])
  })

  it('leaves string row IDs untouched', () => {
    const result = normaliseLoadRowIds(loads({ added: { valid: ['row-2'] } }))

    expect(result.added.valid.rowIds).toEqual(['row-2'])
  })

  it('normalises a mixed list in place, preserving order', () => {
    const result = normaliseLoadRowIds(
      loads({ added: { valid: [1000, 'row-2', 1002] } })
    )

    expect(result.added.valid.rowIds).toEqual(['1000', 'row-2', '1002'])
  })

  it('normalises every validity bucket of every change category', () => {
    const result = normaliseLoadRowIds(
      loads({
        added: { valid: [1], invalid: [2], included: [3], excluded: [4] },
        unchanged: { valid: [5], invalid: [6], included: [7], excluded: [8] },
        adjusted: { valid: [9], invalid: [10], included: [11], excluded: [12] }
      })
    )

    expect(result).toEqual(
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
    const result = normaliseLoadRowIds(
      loads({ added: { valid: [1000, 1001] } })
    )

    expect(result.added.valid.count).toBe(2)
  })

  it('leaves empty row ID lists empty', () => {
    const result = normaliseLoadRowIds(loads())

    expect(result.added.valid.rowIds).toEqual([])
  })

  it('does not mutate the loads it was given', () => {
    const original = loads({ added: { valid: [1000] } })

    normaliseLoadRowIds(original)

    expect(original.added.valid.rowIds).toEqual([1000])
  })
})
