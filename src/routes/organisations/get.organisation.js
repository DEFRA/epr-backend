import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { openYearSchema } from '#common/validation/year-schema.js'
import { ukCalendarDate } from '#common/helpers/dates/uk-calendar-date.js'
import { toYear } from '#common/helpers/dates/year.js'
import { yearActivityState } from '#domain/year-activities/rules.js'
import { decemberWasteControlModeFor } from '#packaging-recycling-notes/index.js'
import { organisationParams, organisationPath } from './natural-keys.js'
import { organisationViewSchema } from './response.schema.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { Organisation } from '#organisation-read-model/vocabulary.js' */
/** @import { CalendarDate } from '#common/helpers/date-formatter.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */
/** @import { YearActivity } from '#domain/year-activities/rules.js' */
/** @typedef {{ year?: Year }} OrganisationQuery */
/** @import { Registration } from '#organisation-read-model/vocabulary.js' */
/** @import { StandingByYear } from '#organisation-read-model/domain/model.js' */

const organisationQuery = { year: openYearSchema() }

/**
 * The trading name when there is one, otherwise the company name.
 * @param {Organisation} organisation
 */
const displayNameOf = ({ name, tradingName }) => tradingName?.trim() || name

/**
 * @param {StandingByYear} byYear
 */
const yearsOf = (byYear) =>
  Object.keys(byYear).map((year) => toYear(Number(year)))

/**
 * The registration with, for each of its years, whether each activity is open
 * on `today`.
 * @param {Registration} registration
 * @param {CalendarDate} today
 */
const registrationAt = (registration, today) => {
  /** @param {YearActivity} activity @param {Year} year */
  const stateOf = (activity, year) => yearActivityState(activity, year, today)
  const mode = decemberWasteControlModeFor(registration)
  return {
    ...registration,
    summaryLogs: Object.fromEntries(
      yearsOf(registration.standingByDate).map((year) => [
        year,
        stateOf('summaryLogs', year)
      ])
    ),
    accreditations: Object.fromEntries(
      Object.entries(registration.accreditations).map(
        ([key, accreditation]) => [
          key,
          {
            ...accreditation,
            prns: stateOf('prns', accreditation.year),
            decemberWaste: {
              ...stateOf('decemberWaste', accreditation.year),
              mode
            }
          }
        ]
      )
    )
  }
}

/**
 * @param {Organisation} organisation
 * @param {Date} [now]
 */
export const organisationFor = (organisation, now = new Date()) => {
  const today = ukCalendarDate(now)
  return {
    ...organisation,
    displayName: displayNameOf(organisation),
    registrations: Object.fromEntries(
      Object.entries(organisation.registrations).map(
        ([number, registration]) => [
          number,
          registrationAt(registration, today)
        ]
      )
    )
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
