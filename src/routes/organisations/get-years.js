import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { lastOpenDay } from '#common/helpers/dates/latest-open-year.js'
import { organisationYears } from '#organisation-read-model/domain/organisation-years.js'
import { organisationParams, organisationPath } from './natural-keys.js'
import { organisationYearsResponseSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

export const organisationYearsGet = {
  method: 'GET',
  path: `${organisationPath}/years`,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: {
      params: Joi.object(organisationParams)
    },
    response: {
      schema: organisationYearsResponseSchema,
      modify: true,
      options: { stripUnknown: true }
    }
  },
  /**
   * @param {HapiRequest & {
   *   params: { organisationNumber: OrganisationNumber }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const organisation =
      await request.organisationReadRepository.findByOrganisationNumber(
        request.params.organisationNumber
      )
    if (!organisation) {
      throw Boom.notFound('Organisation not found')
    }

    return h
      .response({
        years: organisationYears(organisation, lastOpenDay(new Date()))
      })
      .code(StatusCodes.OK)
  }
}
