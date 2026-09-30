import { describe, expect, it } from 'vitest'
import sample from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import { accreditationResponseSchema } from './model.js'

/**
 * A stored accreditation as a read returns it: with the status its history
 * ends on.
 *
 * @param {Record<string, any>} accreditation
 * @returns {Record<string, any>}
 */
const asRead = (accreditation) => ({
  ...accreditation,
  status: accreditation.statusHistory.at(-1).status
})

/** @type {Record<string, any>} */
const firstAccreditation = /** @type {any} */ (sample.accreditations[0])

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
    const { error } = accreditationResponseSchema.validate(
      {
        ...asRead(firstAccreditation),
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
    const { error } = accreditationResponseSchema.validate({
      ...asRead(firstAccreditation),
      reprocessingType: null
    })

    expect(error).toBeUndefined()
  })

  it('accepts an accreditation without a form submission', () => {
    const { formSubmission: _formSubmission, ...read } =
      asRead(firstAccreditation)
    const { error } = accreditationResponseSchema.validate(read)

    expect(error).toBeUndefined()
  })

  it('accepts fields the model does not hold, at any level', () => {
    const read = asRead(firstAccreditation)
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
