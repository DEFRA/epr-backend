import { loadsSchema, responseLoadsSchema } from './loads-schema.js'

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

describe('loadsSchema (storage)', () => {
  it('accepts string row IDs', () => {
    expect(loadsSchema.validate(loads(['row-2'])).error).toBeUndefined()
  })

  it('accepts numeric row IDs, which summary logs written before ROW_ID coercion still hold', () => {
    expect(loadsSchema.validate(loads([1000])).error).toBeUndefined()
  })
})

describe('responseLoadsSchema', () => {
  it('accepts string row IDs', () => {
    expect(responseLoadsSchema.validate(loads(['row-2'])).error).toBeUndefined()
  })

  it('rejects numeric row IDs, which the read path normalises before responding', () => {
    const { error } = responseLoadsSchema.validate(loads([1000]))

    expect(error?.message).toMatch(/must be a string/)
  })

  it('caps the number of listed row IDs', () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => `row-${i}`)

    const { error } = responseLoadsSchema.validate(loads(tooMany))

    expect(error?.message).toMatch(/must contain less than or equal to 100/)
  })
})
