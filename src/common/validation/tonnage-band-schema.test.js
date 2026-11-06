import { describe, expect, it } from 'vitest'
import { tonnageBandSchema } from './tonnage-band-schema.js'
import { expectValidationError } from './validation-test-helpers.js'

describe('#tonnageBandSchema', () => {
  it.each(['up_to_500', 'up_to_5000', 'up_to_10000', 'over_10000'])(
    'accepts %s',
    (band) => {
      const { error, value } = tonnageBandSchema.validate(band)

      expect(error).toBeUndefined()
      expect(value).toBe(band)
    }
  )

  it('rejects a band that is not one of them', () => {
    const [detail] = expectValidationError(tonnageBandSchema, 'lots')

    expect(detail.type).toBe('any.only')
  })
})
