import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { yearSchema } from '#common/validation/year-schema.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { RegistrationNumber } from '#domain/organisations/numbers.js' */
/** @import { FutureAccreditation } from '#future-accreditations/repository/port.js' */

/**
 * @typedef {{ registrationNumber: RegistrationNumber, year: Year }} StubAccreditationParams
 */

export const stubAccreditationPath =
  '/v1/dev/stub-accreditations/{registrationNumber}/{year}'

export const stubAccreditationParams = Joi.object({
  registrationNumber: Joi.string().custom(toRegistrationNumber).required(),
  year: yearSchema().required()
})

export const devStubAccreditationPut = {
  method: 'PUT',
  path: stubAccreditationPath,
  options: {
    auth: false,
    tags: ['api'],
    validate: { params: stubAccreditationParams }
  },

  /**
   * @param {HapiRequest<Omit<FutureAccreditation, 'registrationNumber' | 'year'>> & { params: StubAccreditationParams }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { registrationNumber, year } = request.params
    const { accreditationNumber, prnIssuance, status } = request.payload
    const stored = await request.futureAccreditationsRepository.upsert({
      registrationNumber,
      year,
      accreditationNumber,
      prnIssuance,
      status
    })
    return h.response(stored).code(StatusCodes.OK)
  }
}
