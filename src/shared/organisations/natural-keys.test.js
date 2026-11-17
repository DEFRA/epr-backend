import Joi from 'joi'

import { registrationParams } from './natural-keys.js'

describe('registrationParams', () => {
  const schema = Joi.object(registrationParams)

  it('accepts a registration number', () => {
    expect(
      schema.validate({
        organisationNumber: '500001',
        registrationNumber: 'R26ER5001180041PL'
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
