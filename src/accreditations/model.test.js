import { describe, expect, it } from 'vitest'
import sample from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import { accreditationResponseSchema } from './model.js'

/**
 * A stored accreditation as a read returns it: with the status its history
 * ends on.
 *
 * @param {Record<string, any>} accreditation
 */
const asRead = (accreditation) => ({
  ...accreditation,
  status: accreditation.statusHistory.at(-1).status
})

describe('accreditationResponseSchema', () => {
  it.each(sample.accreditations.map((a) => [a.id, a]))(
    'accepts the sample accreditation %s',
    (_, accreditation) => {
      const { error } = accreditationResponseSchema.validate(
        asRead(accreditation)
      )

      expect(error).toBeUndefined()
    }
  )

  it('requires an approved accreditation to carry its validity window', () => {
    const [accreditation] = sample.accreditations
    const { error } = accreditationResponseSchema.validate(
      {
        ...asRead(accreditation),
        status: 'approved',
        accreditationNumber: 'A26SR5120384065PA',
        validFrom: null,
        validTo: null
      },
      { abortEarly: false }
    )

    expect(error?.details.map((d) => d.path.join('.'))).toStrictEqual([
      'validFrom',
      'validTo'
    ])
  })

  it('accepts a reprocessing type not yet set', () => {
    const [accreditation] = sample.accreditations
    const { error } = accreditationResponseSchema.validate({
      ...asRead(accreditation),
      reprocessingType: null
    })

    expect(error).toBeUndefined()
  })

  it('accepts fields the model does not hold, at any level', () => {
    const [accreditation] = sample.accreditations
    const read = asRead(accreditation)
    const { error } = accreditationResponseSchema.validate({
      ...read,
      unexpected: true,
      site: {
        ...read.site,
        address: { ...read.site.address, unexpected: true }
      }
    })

    expect(error).toBeUndefined()
  })
})
