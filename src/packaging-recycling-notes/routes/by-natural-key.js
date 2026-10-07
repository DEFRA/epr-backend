import Boom from '@hapi/boom'
import Joi from 'joi'
import { StatusCodes } from 'http-status-codes'

import { SCOPES } from '#common/helpers/auth/constants.js'
import { appliedForMaterialSchema } from '#common/validation/material-schema.js'
import {
  catchUpPrnProjection,
  getProjectedPrnById
} from '#packaging-recycling-notes/application/get-projected-prn.js'
import { isRegulatorCancellable } from '#packaging-recycling-notes/domain/cancellation.js'
import { getProcessCode } from '#packaging-recycling-notes/domain/get-process-code.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  accreditationIds,
  atNaturalKeys
} from '#routes/organisations/by-natural-key.js'
import {
  accreditationParams,
  accreditationPath
} from '#routes/organisations/view-route.js'
import { DECEMBER_WASTE_CONTROL_MODE } from '#packaging-recycling-notes/domain/december-waste-control-mode.js'
import {
  adminPackagingRecyclingNotesCancel,
  cancelPrnHandler
} from './admin-cancel.js'
import { packagingRecyclingNotesDecemberEligibility } from './december-eligibility.js'
import { isServedUnder } from './get-by-id.js'
import { createPrn, packagingRecyclingNotesCreate } from './post.js'
import {
  packagingRecyclingNotesUpdateStatus,
  updatePrnStatusHandler
} from './status.js'
import { createWasteBalanceService } from '#waste-balances/application/waste-balance-service.js'
import { createStatusesValidator } from './validation.js'

/**
 * @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js'
 * @import { AppliedForMaterial } from '#domain/organisations/model.js'
 * @import { PackagingRecyclingNote, PrnStatus } from '#packaging-recycling-notes/domain/model.js'
 * @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js'
 * @import { ResolveIds, Route } from '#routes/organisations/by-natural-key.js'
 * @import { AccreditationParams } from '#routes/organisations/view-route.js'
 * @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js'
 *
 * @typedef {{ organisationId: string, registrationId: string, accreditationId: string }} AccreditationIds
 * @typedef {AccreditationParams & { prnId: string }} PrnParams
 *
 * @typedef {HapiRequest & {
 *   packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository,
 *   ledgerRepository: WasteBalanceLedgerRepository
 * }} PrnRequest
 *
 * @typedef {{
 *   id: string,
 *   prnNumber?: string,
 *   status: PrnStatus,
 *   issuedToOrganisation: {
 *     id: string,
 *     name: string,
 *     tradingName?: string,
 *     registrationType?: string
 *   },
 *   tonnage: number,
 *   material: AppliedForMaterial,
 *   processToBeUsed: string | null,
 *   isDecemberWaste: boolean,
 *   obligationYear: number,
 *   notes?: string,
 *   createdAt: string,
 *   issued?: { at: string, by: { name?: string, position?: string } },
 *   regulatorCancellable: boolean
 * }} PrnResource
 */

const prnsPath = `${accreditationPath}/packaging-recycling-notes`
const prnPath = `${prnsPath}/{prnId}`

const prnIdSchema = Joi.string().hex().length(24).required()
const prnParams = { ...accreditationParams, prnId: prnIdSchema }

const servedStatuses = Object.values(PRN_STATUS).filter(
  (status) => status !== PRN_STATUS.DELETED
)

const issuedStatuses = [
  PRN_STATUS.AWAITING_ACCEPTANCE,
  PRN_STATUS.ACCEPTED,
  PRN_STATUS.AWAITING_CANCELLATION,
  PRN_STATUS.CANCELLED
]
const onceIssued = Joi.valid(...issuedStatuses)

const isoDateTime = Joi.string().isoDate().required()

const prnSchema = Joi.object({
  id: Joi.string().required(),
  prnNumber: Joi.string().when('status', {
    not: onceIssued,
    then: Joi.forbidden()
  }),
  status: Joi.string()
    .valid(...Object.values(PRN_STATUS))
    .required(),
  issuedToOrganisation: Joi.object({
    id: Joi.string().required(),
    name: Joi.string().required(),
    tradingName: Joi.string(),
    registrationType: Joi.string()
  }).required(),
  tonnage: Joi.number().required(),
  material: appliedForMaterialSchema.required(),
  processToBeUsed: Joi.string().required(),
  isDecemberWaste: Joi.boolean().required(),
  obligationYear: Joi.number().integer().required(),
  notes: Joi.string(),
  createdAt: isoDateTime,
  issued: Joi.object({
    at: isoDateTime,
    by: Joi.object({ name: Joi.string(), position: Joi.string() }).required()
  }).when('status', { not: onceIssued, then: Joi.forbidden() }),
  regulatorCancellable: Joi.boolean().required()
})

/**
 * A PRN as the accreditation serves it. Its number is a field, present once
 * the PRN is issued, and a client finds a PRN by it through the collection.
 *
 * @param {PackagingRecyclingNote} prn
 * @param {Date} now
 * @returns {PrnResource}
 */
const toPrnResource = (prn, now) => {
  const { id, name, tradingName, registrationType } = prn.issuedToOrganisation
  const { issued } = prn.status
  return {
    id: prn.id,
    ...(prn.prnNumber && { prnNumber: prn.prnNumber }),
    status: prn.status.currentStatus,
    issuedToOrganisation: {
      id,
      name,
      ...(tradingName && { tradingName }),
      ...(registrationType && { registrationType })
    },
    tonnage: prn.tonnage,
    material: prn.accreditation.material,
    processToBeUsed: getProcessCode(prn.accreditation.material),
    isDecemberWaste: prn.isDecemberWaste,
    obligationYear: prn.obligationYear,
    ...(prn.notes && { notes: prn.notes }),
    createdAt: new Date(prn.createdAt).toISOString(),
    ...(issued && {
      issued: {
        at: new Date(issued.at).toISOString(),
        by: {
          ...(issued.by.name && { name: issued.by.name }),
          ...(issued.by.position && { position: issued.by.position })
        }
      }
    }),
    regulatorCancellable: isRegulatorCancellable(
      prn.status.currentStatus,
      prn.accreditation.accreditationYear,
      now
    )
  }
}

/**
 * @param {PackagingRecyclingNote} a
 * @param {PackagingRecyclingNote} b
 */
const newestFirst = (a, b) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()

const prnsList = {
  method: 'GET',
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    validate: {
      query: Joi.object({
        statuses: createStatusesValidator(servedStatuses).optional(),
        prnNumber: Joi.string()
      })
    },
    response: {
      schema: Joi.object({ items: Joi.array().items(prnSchema).required() })
    }
  },
  /**
   * The PRNs of one accreditation are few, so the whole set is read, each is
   * caught up to the ledger, and the filters are applied in memory.
   *
   * @param {PrnRequest & {
   *   params: AccreditationIds,
   *   query: { statuses?: PrnStatus[], prnNumber?: string }
   * }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { organisationId, registrationId, accreditationId } = request.params
    const { statuses, prnNumber } = request.query
    const stored =
      await request.packagingRecyclingNotesRepository.findByAccreditation({
        organisationId,
        registrationId,
        accreditationId
      })
    const service = createWasteBalanceService(request.ledgerRepository)
    const prns = await Promise.all(
      stored.map((prn) => catchUpPrnProjection(prn, service))
    )

    const now = new Date()
    const items = prns
      .filter(
        (prn) =>
          prn.status.currentStatus !== PRN_STATUS.DELETED &&
          (!statuses || statuses.includes(prn.status.currentStatus)) &&
          (!prnNumber || prn.prnNumber === prnNumber)
      )
      .sort(newestFirst)
      .map((prn) => toPrnResource(prn, now))

    return h.response({ items }).code(StatusCodes.OK)
  }
}

const prnGet = {
  method: 'GET',
  options: {
    auth: { scope: [SCOPES.organisationRead, SCOPES.adminRead] },
    tags: ['api'],
    response: { schema: prnSchema }
  },
  /**
   * @param {PrnRequest & { params: AccreditationIds & { prnId: string } }} request
   * @param {HapiResponseToolkit} h
   */
  handler: async (request, h) => {
    const { packagingRecyclingNotesRepository, ledgerRepository, params } =
      request
    const prn = await getProjectedPrnById({
      packagingRecyclingNotesRepository,
      ledgerRepository,
      prnId: params.prnId
    })
    if (!isServedUnder(prn, params)) {
      throw Boom.notFound('PRN not found')
    }
    return h.response(toPrnResource(prn, new Date())).code(StatusCodes.OK)
  }
}

/**
 * The existing PRN commands name the PRN `id`.
 *
 * @type {ResolveIds<PrnParams>}
 */
const prnIds = async (request) => ({
  ...(await accreditationIds(request)),
  id: request.params.prnId
})

/** @param {PackagingRecyclingNote} prn */
const servePrn = (prn) => toPrnResource(prn, new Date())

/**
 * @param {Route} route
 * @param {Joi.Schema} schema
 * @param {Route['handler']} [handler]
 */
const declaringResponse = (route, schema, handler = route.handler) => ({
  ...route,
  options: { ...route.options, response: { schema } },
  handler
})

const cancelServingPrn = cancelPrnHandler(servePrn)

/**
 * The existing cancel command takes any PRN by its id, so the PRN is first
 * proved to be the accreditation's own.
 *
 * @param {Parameters<typeof cancelServingPrn>[0] & {
 *   params: AccreditationIds
 * }} request
 * @param {HapiResponseToolkit} h
 */
const cancelOwnPrn = async (request, h) => {
  const { packagingRecyclingNotesRepository, params } = request
  const prn = await packagingRecyclingNotesRepository.findById(params.id)
  if (!isServedUnder(prn, params)) {
    throw Boom.notFound('PRN not found')
  }
  return cancelServingPrn(request, h)
}

const decemberEligibilitySchema = Joi.object({
  mode: Joi.string()
    .valid(...Object.values(DECEMBER_WASTE_CONTROL_MODE))
    .required(),
  windowOpen: Joi.boolean().required()
})

export const prnRoutesByNaturalKey = [
  atNaturalKeys(prnsList, prnsPath, accreditationParams, accreditationIds),
  atNaturalKeys(
    declaringResponse(
      packagingRecyclingNotesCreate,
      prnSchema,
      createPrn(servePrn)
    ),
    prnsPath,
    accreditationParams,
    accreditationIds
  ),
  atNaturalKeys(
    declaringResponse(
      packagingRecyclingNotesDecemberEligibility,
      decemberEligibilitySchema
    ),
    `${prnsPath}/december-prn-eligibility`,
    accreditationParams,
    accreditationIds
  ),
  atNaturalKeys(prnGet, prnPath, prnParams, accreditationIds),
  atNaturalKeys(
    declaringResponse(
      packagingRecyclingNotesUpdateStatus,
      prnSchema,
      updatePrnStatusHandler(servePrn)
    ),
    `${prnPath}/status`,
    prnParams,
    prnIds
  )
]

export const prnCancelByNaturalKey = atNaturalKeys(
  declaringResponse(
    adminPackagingRecyclingNotesCancel,
    prnSchema,
    cancelOwnPrn
  ),
  `${prnPath}/cancel`,
  prnParams,
  prnIds
)
