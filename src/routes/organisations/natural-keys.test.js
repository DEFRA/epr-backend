import { REPROCESSOR_NUMBER } from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import Joi from 'joi'
import { registrationParams } from './natural-keys.js'

describe('registrationParams', () => {
  const schema = Joi.object(registrationParams)

  it('accepts a registration number', () => {
    expect(
      schema.validate({
        organisationNumber: '500001',
        registrationNumber: REPROCESSOR_NUMBER
      }).error
    ).toBeUndefined()
  })

  it.each(['constructor', '__proto__', 'toString', 'r26er5001180098pl'])(
    'rejects a registration number of %s',
    (registrationNumber) => {
      expect(
        schema.validate({ organisationNumber: '500001', registrationNumber })
          .error
      ).toBeDefined()
    }
  )
})
