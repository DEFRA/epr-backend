import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { lastOpenDay } from '#common/helpers/dates/latest-open-year.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  accreditationPath,
  accreditationsForYear,
  findOrganisationAndRegistrationReadModels,
  organisationParams,
  organisationPath,
  registrationParams,
  registrationPath,
  servedRegistrations
} from '#routes/organisations/natural-keys.js'
import { naturalKeyLedgerResponseSchema } from '#routes/v1/organisations/registrations/waste-balance-ledger-response.schema.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { toBalanceBody } from './balance-body.js'
import { wasteBalanceSchema } from './response.schema.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { ResolvedParams, ResolvedRecords, ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 * @import { RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { LedgerEventResource } from '#waste-balances/application/read-ledger.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 */

/**
 * @typedef {ResolvedRequest & {
 *   ledgerRepository: WasteBalanceLedgerRepository,
 *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository
 * }} LedgerRequest
 */

const yearParams = { ...registrationParams, year: yearSchema().required() }

const ledgerOptions = {
  auth: {
    scope: [`+${SCOPES.organisationRead}`, `+${SCOPES.wasteBalanceLedgerRead}`]
  },
  tags: ['api'],
  response: { schema: naturalKeyLedgerResponseSchema }
}

/**
 * The ledger the path resolved to: the accreditation's, or the registered-only
 * one when the path names no accreditation.
 *
 * @param {ResolvedParams} params
 * @returns {WasteBalanceLedgerId}
 */
const ledgerIdOf = ({
  organisationNumber,
  registrationNumber,
  accreditationNumber
}) => ({
  organisationNumber,
  registrationNumber,
  accreditationNumber: accreditationNumber ?? null
})

/**
 * @param {LedgerRequest} request
 * @returns {Promise<LedgerEventResource[]>}
 */
const readLedgerEvents = async (request) => {
  const { events } = await readLedger(
    request.ledgerRepository,
    request.packagingRecyclingNotesRepository,
    ledgerIdOf(request.params)
  )
  return events
}

/**
 * The registered-only ledger spans a registration's years, so a year narrows
 * it to the events submitted in that year (UTC). A year the registration was
 * not approved in is not found.
 */
const registeredOnlyLedgerGet = {
  method: 'GET',
  options: ledgerOptions,
  /**
   * @param {LedgerRequest & { params: { year: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { year } = request.params

    const { registration } =
      await findOrganisationAndRegistrationReadModels(request)

    if (
      !approvedYears(registration.status.timeline, lastOpenDay()).includes(year)
    ) {
      throw Boom.notFound('Year not found')
    }
    const events = await readLedgerEvents(request)
    return h
      .response({
        events: events.filter(
          (event) => event.createdAt.getUTCFullYear() === year
        )
      })
      .code(StatusCodes.OK)
  }
}

/** An accreditation belongs to one year, so its whole ledger is served. */
const accreditedLedgerGet = {
  method: 'GET',
  options: ledgerOptions,
  /**
   * @param {LedgerRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) =>
    h.response({ events: await readLedgerEvents(request) }).code(StatusCodes.OK)
}

/** The balance of the accreditation the path resolved to. */
const accreditationWasteBalanceGet = {
  method: 'GET',
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    response: { schema: wasteBalanceSchema }
  },
  /**
   * @param {ResolvedRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const balance = await request.wasteBalanceService.currentBalance(
      ledgerIdOf(request.params)
    )
    return h.response(toBalanceBody(balance)).code(StatusCodes.OK)
  }
}

/**
 * The balance of each accreditation for the year, keyed by accreditation
 * number. A registration the read model does not serve, or without exactly one
 * accreditation for the year, is left out, as the read model leaves it out.
 */
const organisationWasteBalancesGet = {
  method: 'GET',
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    response: {
      schema: Joi.object().pattern(Joi.string(), wasteBalanceSchema)
    }
  },
  /**
   * @param {ResolvedRequest & { params: { year: Year }, app: ResolvedRecords }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { storedOrganisation: organisation } = request.app
    const { year } = request.params

    const accredited = servedRegistrations(organisation).flatMap(
      (registration) => {
        const accreditations = accreditationsForYear(
          organisation,
          registration,
          year
        )
        return accreditations.length === 1
          ? [{ registration, accreditation: accreditations[0] }]
          : []
      }
    )

    const balances = await Promise.all(
      accredited.map(async ({ registration, accreditation }) => [
        accreditation.accreditationNumber,
        toBalanceBody(
          await request.wasteBalanceService.currentBalance({
            organisationNumber: request.params.organisationNumber,
            // A served registration is found by its number.
            registrationNumber: /** @type {RegistrationNumber} */ (
              registration.registrationNumber
            ),
            accreditationNumber: accreditation.accreditationNumber
          })
        )
      ])
    )

    return h.response(Object.fromEntries(balances)).code(StatusCodes.OK)
  }
}

/**
 * Ledger and waste balance routes addressed by organisation number,
 * registration number and year (ADR 0053), served beside the id-based routes.
 */
export const wasteBalanceRoutesByNaturalKey = [
  atNaturalKeys(
    registeredOnlyLedgerGet,
    `${registrationPath}/ledger/{year}`,
    yearParams
  ),
  atNaturalKeys(
    accreditedLedgerGet,
    `${accreditationPath}/ledger`,
    yearParams,
    {
      accredited: true
    }
  ),
  atNaturalKeys(
    accreditationWasteBalanceGet,
    `${accreditationPath}/waste-balance`,
    yearParams,
    { accredited: true }
  ),
  atNaturalKeys(
    organisationWasteBalancesGet,
    `${organisationPath}/waste-balances/{year}`,
    { ...organisationParams, year: yearSchema().required() }
  )
]
