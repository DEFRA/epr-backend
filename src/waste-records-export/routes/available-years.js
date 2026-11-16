import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { openYearSchema } from '#common/validation/year-schema.js'
import { availableWasteRecordYears } from '../domain/available-years.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */

const availableWasteRecordYearsResponseSchema = Joi.object({
  years: Joi.array()
    .items(Joi.object({ year: openYearSchema().required() }))
    .required()
})

export const availableWasteRecordYearsGet = {
  method: 'GET',
  path: '/waste-records/years',
  options: {
    auth: getAuthConfig([SCOPES.organisationRead, SCOPES.adminRead]),
    tags: ['api'],
    response: { schema: availableWasteRecordYearsResponseSchema }
  },
  /**
   * @param {HapiRequest} _request
   * @param {HapiResponseToolkit} h
   */
  handler: (_request, h) =>
    h
      .response({
        years: availableWasteRecordYears().map((year) => ({ year }))
      })
      .code(StatusCodes.OK)
}
