import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { utcCalendarDate } from '#common/helpers/date-formatter.js'
import { toYear } from '#common/helpers/dates/year.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { regAccStatusByDate } from '#organisation-read-model/domain/reg-acc-status-by-date.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'
import { organisationInYear } from '#organisation-read-model/domain/years.js'
import { isRelevantYearOpen } from '#packaging-recycling-notes/domain/closed-year.js'
import { organisationParams, organisationPath } from './natural-keys.js'
import { organisationViewSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation, Registration } from '#organisation-read-model/domain/model.js' */
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
 * The registration's regAccStatusByDate for one year, or otherwise for each year
 * it was approved in or holds an accreditation for, which can be a later year.
 * @param {Registration} registration
 * @param {Year | undefined} year
 * @param {Date} now
 */
const regAccStatusByYear = (registration, year, now) => {
  const years =
    year === undefined
      ? [
          ...approvedYears(registration.status.timeline, utcCalendarDate(now)),
          ...Object.keys(registration.accreditations).map((accreditationYear) =>
            toYear(Number(accreditationYear))
          )
        ]
      : [year]

  return Object.fromEntries(
    years.map((served) => [served, regAccStatusByDate(registration, served)])
  )
}

/**
 * @param {Organisation['registrations']} registrations
 * @param {Year | undefined} year
 * @param {Date} now
 */
const registrationsAt = (registrations, year, now) =>
  Object.fromEntries(
    Object.entries(registrations).map(([number, registration]) => [
      number,
      {
        ...registration,
        accreditations: withPrnYearState(registration.accreditations, now),
        regAccStatusByDate: regAccStatusByYear(registration, year, now)
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
    registrations: registrationsAt(inYear.registrations, year, now)
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

    return h
      .response(organisationFor(organisation, request.query))
      .code(StatusCodes.OK)
  }
}
