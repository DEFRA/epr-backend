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
import { subtract, toNumber } from '#common/helpers/decimal-utils.js'
import { conflict } from '#common/helpers/logging/cdp-boom.js'
import {
  WASTE_PROCESSING_TYPE,
  ACCREDITATION_STATUS
} from '#domain/organisations/model.js'
import { assertDecemberWasteDeclarable } from '#packaging-recycling-notes/domain/december-waste-window.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { packagingRecyclingNotesCreatePayloadSchema } from './post.schema.js'

/**
 * @import { CreatePrnResponse, PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { OrganisationsRepository } from '#repositories/organisations/port.js'
 * @import { HapiRequest } from '#common/hapi-types.js'
 */

/**
 * @typedef {{
 *   issuedToOrganisation: { id: string; name: string; tradingName?: string; registrationType?: string };
 *   tonnage: number;
 *   notes?: string;
 *   isDecemberWaste: boolean;
 * }} PackagingRecyclingNotesCreatePayload
 */

export const packagingRecyclingNotesCreatePath =
  '/v1/organisations/{organisationId}/registrations/{registrationId}/accreditations/{accreditationId}/packaging-recycling-notes'

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
 * @param {PackagingRecyclingNote} prn
 * @param {{ wasteProcessingType: string }} accreditation
 * @returns {CreatePrnResponse}
 */
const buildResponse = (prn, { wasteProcessingType }) => ({
  id: prn.id,
  accreditationYear: prn.accreditation.accreditationYear,
  createdAt: prn.createdAt,
  isDecemberWaste: prn.isDecemberWaste,
  obligationYear: prn.obligationYear,
  issuedToOrganisation: prn.issuedToOrganisation,
  material: prn.accreditation.material,
  notes: prn.notes ?? null,
  processToBeUsed: /** @type {string} */ (
    getProcessCode(prn.accreditation.material)
  ),
  status: prn.status.currentStatus,
  tonnage: prn.tonnage,
  wasteProcessingType
})

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
    message: `Failure on ${packagingRecyclingNotesCreatePath}`,
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

  throw Boom.badImplementation(
    `Failure on ${packagingRecyclingNotesCreatePath}`
  )
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
 * The pool the draft draws from is chosen by `isDecemberWaste`: a December
 * draft is capped by the December available balance; a general one by the
 * general available (the total available less the December tonnage the December
 * pool reserves). The authoritative ringfence is still the create decider; this
 * mirrors its pool choice so the raise journey refuses early with the same 409.
 *
 * @param {Object} params
 * @param {import('#waste-balances/repository/ledger-port.js').WasteBalanceLedgerRepository} params.ledgerRepository
 * @param {import('#waste-balances/repository/ledger-schema.js').WasteBalanceLedgerId} params.ledgerId
 * @param {number} params.tonnage
 * @param {boolean} params.isDecemberWaste
 */
const assertSufficientAvailableBalance = async ({
  ledgerRepository,
  ledgerId,
  tonnage,
  isDecemberWaste
}) => {
  const balance =
    await createWasteBalanceService(ledgerRepository).currentBalance(ledgerId)

  const availableAmount = balance?.availableAmount ?? 0
  const decemberAvailableAmount = balance?.decemberAvailableAmount ?? 0
  const availableForPool = isDecemberWaste
    ? decemberAvailableAmount
    : toNumber(subtract(availableAmount, decemberAvailableAmount))

  if (tonnage > availableForPool) {
    throw conflict(
      'Insufficient available waste balance',
      INSUFFICIENT_AVAILABLE_BALANCE_CODE,
      {
        event: {
          action: LOGGING_EVENT_ACTIONS.REQUEST_FAILURE,
          reason: `tonnage=${tonnage} available=${availableForPool} isDecemberWaste=${isDecemberWaste} rejected=${INSUFFICIENT_AVAILABLE_BALANCE_CODE}`
        },
        payload: { code: INSUFFICIENT_AVAILABLE_BALANCE_CODE }
      }
    )
  }
}

export const packagingRecyclingNotesCreate = {
  method: 'POST',
  path: packagingRecyclingNotesCreatePath,
  options: {
    auth: getAuthConfig([SCOPES.organisationWrite]),
    tags: ['api'],
    validate: {
      payload: packagingRecyclingNotesCreatePayloadSchema
    }
  },
  /**
   * @param {HapiRequest<PackagingRecyclingNotesCreatePayload> & {
   *   organisationsRepository: OrganisationsRepository,
   *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
   *   params: { organisationId: string, registrationId: string, accreditationId: string }
   * }} request
   * @param {Object} h - Hapi response toolkit
   */
  handler: async (request, h) => {
    const {
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
      const [accreditation, org] = await Promise.all([
        organisationsRepository.findAccreditationById(
          organisationId,
          accreditationId
        ),
        organisationsRepository.findById(organisationId)
      ])

      if (accreditation.status === ACCREDITATION_STATUS.CANCELLED) {
        throw Boom.forbidden('Cannot create a PRN on a cancelled accreditation')
      }

      assertDecemberWasteDeclarable({
        accreditation,
        isDecemberWaste: payload.isDecemberWaste,
        now,
        config: config.get('decemberWaste')
      })

      await assertSufficientAvailableBalance({
        ledgerRepository,
        ledgerId: { organisationId, registrationId, accreditationId },
        tonnage: payload.tonnage,
        isDecemberWaste: payload.isDecemberWaste
      })

      const isExport =
        accreditation.wasteProcessingType === WASTE_PROCESSING_TYPE.EXPORTER

      const organisation = {
        id: organisationId,
        name: org.companyDetails.name,
        ...(org.companyDetails.tradingName && {
          tradingName: org.companyDetails.tradingName
        })
      }

      const prnData = buildPrnData({
        organisation,
        registrationId,
        accreditation,
        payload,
        user,
        isExport,
        now
      })
      const prn = await packagingRecyclingNotesRepository.create(prnData)

      logger.info({
        message: `PRN created: id=${prn.id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.SERVER,
          action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS,
          reference: prn.id
        }
      })

      return h
        .response(buildResponse(prn, accreditation))
        .code(StatusCodes.CREATED)
    } catch (error) {
      throwCreatePrnError(error, logger)
    }
  }
}
