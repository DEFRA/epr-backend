import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { SCOPES } from '#common/helpers/auth/constants.js'
import { getAuthConfig } from '#common/helpers/auth/get-auth-config.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  WASTE_PROCESSING_TYPE,
  ACCREDITATION_STATUS
} from '#domain/organisations/model.js'
import { assertDecemberWasteDeclarable } from '#packaging-recycling-notes/domain/december-waste-window.js'
import {
  closedYearConflict,
  closedYearRefusal
} from '#packaging-recycling-notes/domain/closed-year.js'
import {
  toIssuingAccreditation,
  toPrnSiteAddress
} from '#packaging-recycling-notes/domain/issuing-accreditation.js'
import { resolvePool } from '#packaging-recycling-notes/domain/resolve-pool.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { prnMetrics } from '#packaging-recycling-notes/application/metrics.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { processingTypeFor } from '#waste-balances/domain/credited-tonnage.js'
import { availableForPool } from '#waste-balances/domain/pool-balances.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/**
 * @import { Actor, AccreditationSnapshot, OrganisationSnapshot, PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js'
 * @import { IssuingAccreditation } from '#packaging-recycling-notes/domain/issuing-accreditation.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 * @import { WasteBalanceLedgerId } from '#waste-balances/repository/ledger-schema.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { RegistrationNumber } from '#domain/organisations/numbers.js'
 * @import { Organisation as ReadModelOrganisation } from '#organisation-read-model/domain/model.js'
 * @import { PrnKeys, PrnRecords } from './at-prn-keys.js'
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
 * The accreditation as it stands when the PRN is raised, which the PRN states
 * as a certificate does.
 *
 * @param {IssuingAccreditation} accreditation
 * @param {AccreditationSnapshot['siteAddress']} siteAddress
 * @returns {AccreditationSnapshot}
 */
const snapshotAccreditation = (
  {
    accreditationNumber,
    accreditationYear,
    material,
    submittedToRegulator,
    glassRecyclingProcess
  },
  siteAddress
) => ({
  accreditationNumber,
  accreditationYear,
  material,
  submittedToRegulator,
  ...(glassRecyclingProcess && { glassRecyclingProcess }),
  ...(siteAddress && { siteAddress })
})

/**
 * Build PRN data for creation
 *
 * @param {{
 *   organisation: OrganisationSnapshot,
 *   registrationNumber: RegistrationNumber,
 *   accreditation: IssuingAccreditation,
 *   siteAddress: AccreditationSnapshot['siteAddress'],
 *   payload: PackagingRecyclingNotesCreatePayload,
 *   user: Actor,
 *   isExport: boolean,
 *   now: Date
 * }} params
 */
const buildPrnData = ({
  organisation,
  registrationNumber,
  accreditation,
  siteAddress,
  payload,
  user,
  isExport,
  now
}) => {
  const accreditationSnapshot = snapshotAccreditation(
    accreditation,
    siteAddress
  )

  return {
    schemaVersion: 2,
    version: 1,
    organisation,
    registration: { registrationNumber },
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
 * @param {WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {WasteBalanceLedgerId} params.ledgerId
 * @param {number} params.tonnage
 * @param {boolean} params.isDecemberWaste
 * @param {IssuingAccreditation} params.accreditation
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
 * @param {IssuingAccreditation} accreditation
 * @param {Date} now
 */
const assertRelevantYearOpen = (accreditation, now) => {
  const refusal = closedYearRefusal({
    accreditationYear: accreditation.accreditationYear,
    newStatus: PRN_STATUS.DRAFT,
    now
  })
  if (refusal) {
    throw closedYearConflict(
      refusal,
      `accreditationNumber=${accreditation.accreditationNumber}`
    )
  }
}

/**
 * The rules a draft must satisfy before it is created.
 *
 * @param {Object} params
 * @param {IssuingAccreditation} params.accreditation
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
 * @param {IssuingAccreditation} params.accreditation
 * @param {boolean} params.isDecemberWaste
 */
const recordPrnCreatedMetric = async ({ accreditation, isDecemberWaste }) => {
  await prnMetrics.recordCreated({
    material: accreditation.material,
    isDecemberWaste,
    processingType: processingTypeFor(accreditation)
  })
}

/**
 * @param {ReadModelOrganisation} organisation
 * @returns {OrganisationSnapshot}
 */
const snapshotOrganisation = ({ organisationNumber, name, tradingName }) => ({
  organisationNumber,
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
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   params: PrnKeys,
   *   app: PrnRecords
   * }} request
   * @param {HapiResponseToolkit} h
   */
  async (request, h) => {
    const {
      packagingRecyclingNotesRepository,
      ledgerRepository,
      params,
      payload,
      logger,
      auth
    } = request
    const user = {
      id: auth.credentials?.id ?? 'unknown',
      name: auth.credentials?.name ?? 'unknown'
    }
    const now = new Date()

    try {
      const { organisation, registration } = request.app
      const accreditation = toIssuingAccreditation(
        registration,
        request.app.accreditation,
        params.year
      )

      await assertCreatable({
        accreditation,
        ledgerRepository,
        ledgerId: {
          organisationNumber: params.organisationNumber,
          registrationNumber: params.registrationNumber,
          accreditationNumber: accreditation.accreditationNumber,
          year: accreditation.accreditationYear
        },
        payload,
        now
      })

      const prn = await packagingRecyclingNotesRepository.create(
        buildPrnData({
          organisation: snapshotOrganisation(organisation),
          registrationNumber: params.registrationNumber,
          accreditation,
          siteAddress: toPrnSiteAddress(registration),
          payload,
          user,
          isExport:
            accreditation.wasteProcessingType ===
            WASTE_PROCESSING_TYPE.EXPORTER,
          now
        })
      )

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
      return throwCreatePrnError(
        /** @type {{ isBoom?: boolean, message?: string }} */ (error),
        logger
      )
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
