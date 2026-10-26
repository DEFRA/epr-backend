import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { deriveAccreditationYear } from '#common/helpers/dates/accreditation.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  WASTE_PROCESSING_TYPE,
  ACCREDITATION_STATUS
} from '#domain/organisations/model.js'
import { numbersFor } from '#domain/organisations/numbers.js'
import { assertDecemberWasteDeclarable } from '#packaging-recycling-notes/domain/december-waste-window.js'
import {
  closedYearConflict,
  closedYearRefusal
} from '#packaging-recycling-notes/domain/closed-year.js'
import { resolvePool } from '#packaging-recycling-notes/domain/resolve-pool.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { prnMetrics } from '#packaging-recycling-notes/application/metrics.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { processingTypeFor } from '#waste-balances/domain/credited-tonnage.js'
import { availableForPool } from '#waste-balances/domain/pool-balances.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/**
 * @import { Accreditation } from '#domain/organisations/accreditation.js'
 * @import { PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { HapiRequest } from '#common/hapi-types.js'
 * @import { ResolvedRecords } from '#routes/organisations/at-natural-keys.js'
 */

/**
 * @typedef {{
 *   issuedToOrganisation: { id: string; name: string; tradingName?: string; registrationType?: string };
 *   tonnage: number;
 *   notes?: string;
 *   isDecemberWaste: boolean;
 * }} PackagingRecyclingNotesCreatePayload
 */

const CREATE_PRN_FAILURE = 'Failure creating a PRN'

/**
 * Response-body `code` the create-draft 409 carries when tonnage exceeds the
 * available balance. Contract shared with the frontend, which discriminates on
 * `error.output.payload.code` to render a friendly inline tonnage error.
 */
const INSUFFICIENT_AVAILABLE_BALANCE_CODE = 'INSUFFICIENT_AVAILABLE_BALANCE'

/**
 * Build PRN data for creation
 * @param {Object} params
 * @param {{ id: string; name: string; tradingName?: string }} params.organisation
 * @param {string} params.registrationId
 * @param {import('#domain/organisations/numbers.js').RegistrationNumber} [params.registrationNumber]
 * @param {Object} params.accreditation
 * @param {PackagingRecyclingNotesCreatePayload} params.payload
 * @param {{ id: string; name: string }} params.user
 * @param {boolean} params.isExport
 * @param {Date} params.now
 */
const snapshotAccreditation = (accreditation) => {
  const snapshot = {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber,
    accreditationYear: deriveAccreditationYear(accreditation),
    material: accreditation.material,
    submittedToRegulator: accreditation.submittedToRegulator
  }

  if (
    accreditation.material === 'glass' &&
    accreditation.glassRecyclingProcess?.[0]
  ) {
    snapshot.glassRecyclingProcess = accreditation.glassRecyclingProcess[0]
  }

  if (accreditation.site?.address) {
    snapshot.siteAddress = accreditation.site.address
  }

  return snapshot
}

const buildPrnData = ({
  organisation,
  registrationId,
  registrationNumber,
  accreditation,
  payload,
  user,
  isExport,
  now
}) => {
  const accreditationSnapshot = snapshotAccreditation(accreditation)

  return {
    schemaVersion: 2,
    organisation,
    registrationId,
    ...(registrationNumber && { registration: { registrationNumber } }),
    accreditation: accreditationSnapshot,
    obligationYear: accreditationSnapshot.accreditationYear,
    issuedToOrganisation: payload.issuedToOrganisation,
    tonnage: payload.tonnage,
    isExport,
    ...(payload.notes && { notes: payload.notes }),
    isDecemberWaste: payload.isDecemberWaste,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      currentStatusAt: now,
      history: [{ status: PRN_STATUS.DRAFT, at: now, by: user }]
    },
    createdAt: now,
    createdBy: user,
    updatedAt: now,
    updatedBy: user
  }
}

/**
 * Maps an error thrown while creating a PRN to the appropriate Boom response.
 * @param {{ isBoom?: boolean, message?: string }} error
 * @param {{ error: (details: object) => void }} logger
 * @returns {never}
 */
const throwCreatePrnError = (error, logger) => {
  if (error.isBoom) {
    throw error
  }

  logger.error({
    err: error,
    message: CREATE_PRN_FAILURE,
    event: {
      category: LOGGING_EVENT_CATEGORIES.SERVER,
      action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
    },
    http: {
      response: {
        status_code: StatusCodes.INTERNAL_SERVER_ERROR
      }
    }
  })

  throw Boom.badImplementation(CREATE_PRN_FAILURE)
}

/**
 * Reject draft creation when the requested tonnage exceeds the available waste
 * balance, reusing the 409 the confirm-time transition raises for
 * INSUFFICIENT_AVAILABLE_BALANCE. Point-in-time validation, not a reservation:
 * the balance is ringfenced only at the draft → awaiting_authorisation
 * transition. An empty ledger resolves to zero available, so any positive
 * tonnage is refused.
 *
 * The 409 carries a machine-readable `code` in its body so the frontend can
 * render a friendly inline tonnage error rather than the raw error page; the
 * frontend discriminates on `error.output.payload.code`.
 *
 * The pool checked matches the one the ringfence will debit (ADR-0049): a
 * December raise (`pool === 'december'`) is bounded by the December pool, a
 * general raise by the derived non-December, which reserves December tonnage.
 * The arithmetic is shared with the decider (`availableForPool`) so the
 * pre-check and the ringfence cannot disagree.
 *
 * @param {Object} params
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {number} params.tonnage
 * @param {boolean} params.isDecemberWaste
 * @param {Object} params.accreditation
 */
const assertSufficientAvailableBalance = async ({
  ledgerRepository,
  ledgerId,
  tonnage,
  isDecemberWaste,
  accreditation
}) => {
  const pool = resolvePool({ isDecemberWaste, accreditation })
  const balance =
    await createWasteBalanceService(ledgerRepository).currentBalance(ledgerId)

  const availableAmount = availableForPool(
    balance ?? { amount: 0, availableAmount: 0 },
    pool
  )
  if (tonnage > availableAmount) {
    throw conflict(
      'Insufficient available waste balance',
      INSUFFICIENT_AVAILABLE_BALANCE_CODE,
      {
        event: {
          action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
          reason: `tonnage=${tonnage} available=${availableAmount} pool=${pool} rejected=${INSUFFICIENT_AVAILABLE_BALANCE_CODE}`
        },
        payload: { code: INSUFFICIENT_AVAILABLE_BALANCE_CODE }
      }
    )
  }
}

/**
 * @param {Accreditation} accreditation
 * @param {Date} now
 */
const assertRelevantYearOpen = (accreditation, now) => {
  const refusal = closedYearRefusal({
    accreditationYear: deriveAccreditationYear(accreditation),
    newStatus: PRN_STATUS.DRAFT,
    now
  })
  if (refusal) {
    throw closedYearConflict(refusal, `accreditationId=${accreditation.id}`)
  }
}

/**
 * The rules a draft must satisfy before it is created.
 *
 * @param {Object} params
 * @param {Accreditation} params.accreditation
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {WasteBalanceLedgerId} params.ledgerId
 * @param {PackagingRecyclingNotesCreatePayload} params.payload
 * @param {Date} params.now
 */
const assertCreatable = async ({
  accreditation,
  ledgerRepository,
  ledgerId,
  payload,
  now
}) => {
  if (accreditation.status === ACCREDITATION_STATUS.CANCELLED) {
    throw Boom.forbidden('Cannot create a PRN on a cancelled accreditation')
  }

  assertRelevantYearOpen(accreditation, now)

  assertDecemberWasteDeclarable({
    accreditation,
    isDecemberWaste: payload.isDecemberWaste,
    now,
    config: config.get('decemberWaste')
  })

  await assertSufficientAvailableBalance({
    ledgerRepository,
    ledgerId,
    tonnage: payload.tonnage,
    isDecemberWaste: payload.isDecemberWaste,
    accreditation
  })
}

/**
 * @param {Object} params
 * @param {Object} params.accreditation
 * @param {boolean} params.isDecemberWaste
 */
const recordPrnCreatedMetric = async ({ accreditation, isDecemberWaste }) => {
  await prnMetrics.recordCreated({
    material: accreditation.material,
    isDecemberWaste,
    processingType: processingTypeFor(
      /** @type {import('#waste-balances/domain/credited-tonnage.js').AccreditationContext} */ (
        accreditation
      )
    )
  })
}

/**
 * @param {Object} params
 * @param {string} params.organisationId
 * @param {import('#domain/organisations/numbers.js').OrganisationNumber} [params.organisationNumber]
 * @param {Object} params.companyDetails
 * @param {string} params.companyDetails.name
 * @param {string} [params.companyDetails.tradingName]
 */
const buildOrganisationSnapshot = ({
  organisationId,
  organisationNumber,
  companyDetails: { name, tradingName }
}) => ({
  id: organisationId,
  ...(organisationNumber && { organisationNumber }),
  name,
  ...(tradingName && { tradingName })
})

/**
 * Creates a draft PRN and responds with the body that `respond` builds from it.
 *
 * @param {(prn: PackagingRecyclingNote) => object} respond
 */
export const createPrn =
  (respond) =>
  /**
   * @param {HapiRequest<PackagingRecyclingNotesCreatePayload> & {
   *   app: ResolvedRecords,
   *   organisationsRepository: OrganisationsRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  async (request, h) => {
    const {
      app,
      packagingRecyclingNotesRepository,
      organisationsRepository,
      ledgerRepository,
      params,
      payload,
      logger,
      auth
    } = request
    const { organisationId, registrationId, accreditationId } = params
    const user = {
      id: auth.credentials?.id ?? 'unknown',
      name: auth.credentials?.name ?? 'unknown'
    }
    const now = new Date()

    try {
      const accreditation = await organisationsRepository.findAccreditationById(
        organisationId,
        accreditationId
      )

      await assertCreatable({
        accreditation,
        ledgerRepository,
        ledgerId: { organisationId, registrationId, accreditationId },
        payload,
        now
      })

      const isExport =
        accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

      const { numbers } = numbersFor(app.organisation, { registrationId })

      const organisation = buildOrganisationSnapshot({
        organisationId,
        organisationNumber: numbers.organisationNumber,
        companyDetails: app.organisation.companyDetails
      })

      const prnData = buildPrnData({
        organisation,
        registrationId,
        registrationNumber: numbers.registrationNumber,
        accreditation,
        payload,
        user,
        isExport,
        now
      })
      const prn = await packagingRecyclingNotesRepository.create(prnData)

      await recordPrnCreatedMetric({
        accreditation,
        isDecemberWaste: payload.isDecemberWaste
      })

      logger.info({
        message: `PRN created: id=${prn.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prn.id
        }
      })

      return h.response(respond(prn)).code(StatusCodes.CREATED)
    } catch (error) {
      throwCreatePrnError(error, logger)
    }
  }

export const packagingRecyclingNotesCreate = {
  method: 'POST',
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      payload: packagingRecyclingNotesCreatePayloadSchema
    }
  }
}
