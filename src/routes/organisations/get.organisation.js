import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { toYear } from '#common/helpers/dates/year.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { organisationInYear } from '#organisation-read-model/domain/organisation-years.js'
import { isRelevantYearOpen } from '#packaging-recycling-notes/domain/closed-year.js'
import { organisationParams, organisationPath } from './natural-keys.js'
import { organisationViewSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @typedef {{ year?: Year }} OrganisationQuery */
/** @typedef {{ prns: { open: boolean } }} PrnYearState */

const organisationQuery = { year: yearSchema() }

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
 * @param {OrganisationQuery} query
 */
export const organisationFor = (organisation, { year }) => {
  const now = new Date()
  const inYear =
    year === undefined
      ? organisation
      : organisationInYear(organisation, year, now)
  return {
    ...inYear,
    displayName: displayNameOf(organisation),
    registrations: registrationsAt(inYear.registrations, now)
  }
}

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
    const organisation =
      await request.organisationReadRepository.findByOrganisationNumber(
        request.params.organisationNumber
      )
    if (!organisation) {
      throw Boom.notFound('Organisation not found')
    }
    const { year } = request.query
    if (year !== undefined && year > latestOpenYear(new Date())) {
      throw Boom.notFound('Year not found')
    }

    return h
      .response(organisationFor(organisation, request.query))
      .code(StatusCodes.OK)
  }
}
