import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { toYear } from '#common/helpers/dates/year.js'
import { openYearSchema } from '#common/validation/year-schema.js'
import { isRelevantYearOpen } from '#packaging-recycling-notes/domain/closed-year.js'
import { organisationParams, organisationPath } from './natural-keys.js'
import { organisationViewSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @typedef {{ year?: Year }} OrganisationQuery */
/** @typedef {{ prns: { open: boolean } }} PrnYearState */

const organisationQuery = { year: openYearSchema() }

/**
 * The trading name when there is one, otherwise the company name.
 * @param {Organisation} organisation
 */
const displayNameOf = ({ name, tradingName }) => tradingName?.trim() || name

/**
 * Each accreditation, keyed by its year, with whether PRNs and PERNs are still
 * open for that year.
 * @template {object} A
 * @param {Record<string, A>} accreditations
 * @param {Date} now
 * @returns {Record<string, A & PrnYearState>}
 */
const withPrnYearState = (accreditations, now) =>
  Object.fromEntries(
    Object.entries(accreditations).map(([year, accreditation]) => [
      year,
      {
        ...accreditation,
        prns: { open: isRelevantYearOpen(toYear(Number(year)), now) }
      }
    ])
  )

/**
 * @param {Organisation['registrations']} registrations
 * @param {Date} now
 */
const registrationsAt = (registrations, now) =>
  Object.fromEntries(
    Object.entries(registrations).map(([number, registration]) => [
      number,
      {
        ...registration,
        accreditations: withPrnYearState(registration.accreditations, now)
      }
    ])
  )

/**
 * @param {Organisation} organisation
 */
export const organisationFor = (organisation) => ({
  ...organisation,
  displayName: displayNameOf(organisation),
  registrations: registrationsAt(organisation.registrations, new Date())
})

export const organisationViewGet = {
  method: 'GET',
  path: organisationPath,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: {
      params: Joi.object(organisationParams),
      query: Joi.object(organisationQuery)
    },
    response: {
      schema: organisationViewSchema,
      modify: true,
      options: { stripUnknown: true }
    }
  },
  /**
   *
   * @param {HapiRequest & {
   *   query: OrganisationQuery,
   *   params: { organisationNumber: OrganisationNumber }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { year } = request.query
    const organisation =
      await request.organisationReadRepository.findByOrganisationNumber(
        request.params.organisationNumber,
        { year }
      )
    if (!organisation) {
      throw Boom.notFound('Organisation not found')
    }

    return h.response(organisationFor(organisation)).code(StatusCodes.OK)
  }
}
