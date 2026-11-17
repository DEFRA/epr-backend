import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { latestOpenYear } from '#common/helpers/dates/latest-open-year.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { accreditationForYear } from '#organisation-read-model/domain/accreditation-for-year.js'
import { approvedYears } from '#organisation-read-model/domain/status-timeline.js'
import { atKeys } from '#routes/organisations/at-natural-keys.js'
import {
  accreditationPath,
  organisationParams,
  organisationPath,
  registrationParams,
  registrationPath
} from '#shared/organisations/natural-keys.js'
import {
  findOrganisationAndRegistrationReadModels,
  findOrganisationReadModel
} from '#routes/organisations/natural-keys.js'
import { naturalKeyLedgerResponseSchema } from '#routes/v1/organisations/registrations/waste-balance-ledger-response.schema.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { toBalanceBody } from './balance-body.js'
import { wasteBalanceSchema } from './response.schema.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { Year } from '#common/helpers/dates/year.js'
 * @import { RegistrationNumber } from '#shared/organisations/numbers.js'
 * @import { AccreditationCommon, Organisation, Registration } from '#organisation-read-model/domain/model.js'
 * @import { NaturalKeyRoute } from '#routes/organisations/at-natural-keys.js'
 * @import { OrganisationParams, RegistrationParams } from '#shared/organisations/natural-keys.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { LedgerEventResource } from '#waste-balances/application/read-ledger.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 */

/**
 * `accreditation` is `null` on a registered-only route.
 *
 * @typedef {{
 *   organisation: Organisation,
 *   registration: Registration,
 *   accreditation: AccreditationCommon | null
 * }} LedgerRecords
 *
 * @typedef {HapiRequest & {
 *   params: RegistrationParams & { year: Year },
 *   app: LedgerRecords,
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
 * Wraps a route at a registration's or accreditation's path, reading the
 * organisation, registration and, on an `accredited` route, the accreditation
 * for {year} from the organisation read model into `request.app`.
 *
 * @param {NaturalKeyRoute} route
 * @param {string} path
 * @param {{ accredited?: boolean }} [options]
 */
const atLedgerKeys = (route, path, { accredited = false } = {}) =>
  atKeys(route, path, yearParams, async (request) => {
    const { organisation, registration } =
      await findOrganisationAndRegistrationReadModels(request)

    const accreditation = accredited
      ? accreditationForYear(
          registration,
          /** @type {Year} */ (request.params.year)
        )
      : null
    if (accreditation === undefined) {
      throw Boom.notFound('Accreditation not found')
    }

    /** @type {LedgerRecords} */
    const records = { organisation, registration, accreditation }
    Object.assign(request.app, records)

    return /** @type {LedgerRequest} */ (/** @type {unknown} */ (request))
  })

/**
 * The ledger the path resolved to for its year: the accreditation's, or the
 * registered-only one when the path names no accreditation.
 *
 * @param {LedgerRequest} request
 * @returns {WasteBalanceLedgerId}
 */
const ledgerIdOf = ({
  params: { organisationNumber, registrationNumber, year },
  app: { accreditation }
}) => ({
  organisationNumber,
  registrationNumber,
  accreditationNumber: accreditation?.accreditationNumber ?? null,
  year
})

/**
 * @param {LedgerRequest} request
 * @returns {Promise<LedgerEventResource[]>}
 */
const readLedgerEvents = async (request) => {
  const { events } = await readLedger(
    request.ledgerRepository,
    request.packagingRecyclingNotesRepository,
    ledgerIdOf(request)
  )
  return events
}

/**
 * The registered-only ledger of the year. A year the registration was not
 * approved in is not found.
 */
const registeredOnlyLedgerGet = {
  method: 'GET',
  options: ledgerOptions,
  /**
   * @param {LedgerRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { year } = request.params
    const { registration } = request.app

    if (
      !approvedYears(registration.status.timeline, latestOpenYear()).includes(
        year
      )
    ) {
      throw Boom.notFound('Year not found')
    }
    return h
      .response({ events: await readLedgerEvents(request) })
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
   * @param {LedgerRequest} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const balance = await request.wasteBalanceService.currentBalance(
      ledgerIdOf(request)
    )
    return h.response(toBalanceBody(balance)).code(StatusCodes.OK)
  }
}

/**
 * The balance of each accreditation the read model serves for the year, keyed
 * by accreditation number.
 */
const organisationWasteBalancesGet = {
  method: 'GET',
  path: `${organisationPath}/waste-balances/{year}`,
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: {
      params: Joi.object({
        ...organisationParams,
        year: yearSchema().required()
      })
    },
    response: {
      schema: Joi.object().pattern(Joi.string(), wasteBalanceSchema)
    }
  },
  /**
   * @param {HapiRequest & { params: OrganisationParams & { year: Year } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationNumber, year } = request.params
    const organisation = await findOrganisationReadModel(request)

    const accredited = Object.entries(organisation.registrations).flatMap(
      ([registrationNumber, registration]) => {
        const accreditation = accreditationForYear(registration, year)
        return accreditation
          ? [
              {
                registrationNumber: /** @type {RegistrationNumber} */ (
                  registrationNumber
                ),
                accreditationNumber: accreditation.accreditationNumber
              }
            ]
          : []
      }
    )

    const balances = await Promise.all(
      accredited.map(async (numbers) => [
        numbers.accreditationNumber,
        toBalanceBody(
          await request.wasteBalanceService.currentBalance({
            organisationNumber,
            ...numbers,
            year
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
  atLedgerKeys(registeredOnlyLedgerGet, `${registrationPath}/ledger/{year}`),
  atLedgerKeys(accreditedLedgerGet, `${accreditationPath}/ledger`, {
    accredited: true
  }),
  atLedgerKeys(
    accreditationWasteBalanceGet,
    `${accreditationPath}/waste-balance`,
    { accredited: true }
  ),
  organisationWasteBalancesGet
]
