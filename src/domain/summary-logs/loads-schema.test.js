import { loadsSchema } from './loads-schema.js'

const category = (rowIds) => ({ count: rowIds.length, rowIds })

const validity = (rowIds = []) => ({
  valid: category(rowIds),
  invalid: category([]),
  included: category([]),
  excluded: category([])
})

const loads = (rowIds) => ({
  added: validity(rowIds),
  unchanged: validity(),
  adjusted: validity()
})

describe('loadsSchema', () => {
  it('accepts string row IDs', () => {
    expect(loadsSchema.validate(loads(['row-2'])).error).toBeUndefined()
  })

  it('rejects numeric row IDs', () => {
    const { error } = loadsSchema.validate(loads([1000]))

    expect(error?.message).toMatch(/must be a string/)
  })

  it('caps the number of listed row IDs', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `row-${i}`)

    const { error } = loadsSchema.validate(loads(tooMany))

    expect(error?.message).toMatch(/must contain less than or equal to 100/)
  })
})
