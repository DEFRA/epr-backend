import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { yearSchema } from '#common/validation/year-schema.js'
import { atNaturalKeys } from '#routes/organisations/at-natural-keys.js'
import {
  accreditationsForYear,
  registrationYears,
  servedRegistrations
} from '#routes/organisations/natural-keys.js'
import {
  accreditationPath,
  organisationParams,
  organisationPath,
  registrationParams,
  registrationPath
} from '#routes/organisations/view-route.js'
import { naturalKeyLedgerResponseSchema } from '#routes/v1/organisations/registrations/waste-balance-ledger-response.schema.js'
import { readLedger } from '#waste-balances/application/read-ledger.js'
import { toBalanceBody } from './balance-body.js'
import { wasteBalanceSchema } from './response.schema.js'

/**
 * @import { HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { ResolvedRecords, ResolvedRequest } from '#routes/organisations/at-natural-keys.js'
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
 * The events of the ledger the path resolved to: the accreditation's, or the
 * registered-only one when the path names no accreditation.
 *
 * @param {LedgerRequest} request
 * @returns {Promise<LedgerEventResource[]>}
 */
const readLedgerEvents = async (request) => {
  const { organisationId, registrationId, accreditationId } = request.params
  const { events } = await readLedger(
    request.ledgerRepository,
    request.packagingRecyclingNotesRepository,
    { organisationId, registrationId, accreditationId }
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
   * @param {LedgerRequest & { app: Required<ResolvedRecords> }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const year = /** @type {number} */ (request.params.year)
    if (!registrationYears(request.app.registration).includes(year)) {
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

/**
 * The balance of each registration's accreditation for the year. A
 * registration the read model does not serve, or without exactly one
 * accreditation for the year, is left out, as the read model leaves it out.
 */
const organisationWasteBalancesGet = {
  method: 'GET',
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: { query: Joi.object({ year: yearSchema().required() }) },
    response: {
      schema: Joi.array().items(
        wasteBalanceSchema.keys({
          registrationNumber: Joi.string().required(),
          year: Joi.number().integer().required()
        })
      )
    }
  },
  /**
   * @param {ResolvedRequest & { query: { year: number }, app: ResolvedRecords }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisation } = request.app
    const { year } = request.query

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
      accredited.map(async ({ registration, accreditation }) => ({
        registrationNumber: registration.registrationNumber,
        year,
        ...toBalanceBody(
          await request.wasteBalanceService.currentBalance({
            organisationId: organisation.id,
            registrationId: registration.id,
            accreditationId: accreditation.id
          })
        )
      }))
    )

    return h.response(balances).code(StatusCodes.OK)
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
    organisationWasteBalancesGet,
    `${organisationPath}/waste-balances`,
    organisationParams
  )
]
