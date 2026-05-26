import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { registerRepository } from '#plugins/register-repository.js'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { PrnNumberConflictError } from './port.js'
import { validatePrnInsert } from './validation.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { PackagingRecyclingNote } from '../domain/model.js' */
/** @import { FindByStatusParams, PaginatedResult, RollbackParams, UpdateStatusParams } from './port.js' */

/** @typedef {Map<string, PackagingRecyclingNote>} Storage */

/**
 * @param {Storage} storage
 * @returns {(id: string) => Promise<PackagingRecyclingNote | null>}
 */
const performFindById = (storage) => async (id) => {
  const prn = storage.get(id)
  return prn ? structuredClone(prn) : null
}

/**
 * @param {Storage} storage
 * @returns {(prnNumber: string) => Promise<PackagingRecyclingNote | null>}
 */
const performFindByPrnNumber = (storage) => async (prnNumber) => {
  for (const prn of storage.values()) {
    if (prn.prnNumber === prnNumber) {
      return structuredClone(prn)
    }
  }
  return null
}

/**
 * @param {Storage} storage
 * @returns {(prn: Omit<PackagingRecyclingNote, 'id'>) => Promise<PackagingRecyclingNote>}
 */
const performCreate = (storage) => async (prn) => {
  const validated = validatePrnInsert(prn)
  const id = new ObjectId().toHexString()
  const prnWithId = { ...validated, id }
  storage.set(id, structuredClone(prnWithId))
  return structuredClone(prnWithId)
}

const buildVersionConflictError = (id, expected, actual) =>
  new Error(
    `Version conflict: attempted to update PRN ${id} with version ${expected} but current version is ${actual}`
  )

/**
 * @param {string} id
 * @param {number | undefined} storedEventNumber
 * @param {number | undefined} incomingEventNumber
 * @param {TypedLogger} logger
 */
const enforceMonotonicWatermark = (
  id,
  storedEventNumber,
  incomingEventNumber,
  logger
) => {
  if (
    storedEventNumber !== undefined &&
    (incomingEventNumber === undefined ||
      incomingEventNumber < storedEventNumber)
  ) {
    const conflictError = new Error(
      `Stale watermark: PRN ${id} has already applied event ${storedEventNumber} but the update did not advance it`
    )
    logger.error({
      err: conflictError,
      message: `Stale watermark detected for PRN ${id}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.DB,
        action: LOGGING_EVENT_ACTIONS.WATERMARK_REGRESSION_DETECTED,
        reference: id
      }
    })
    throw Boom.conflict(conflictError.message)
  }
}

/**
 * @param {Storage} storage
 * @returns {(accreditationId: string) => Promise<PackagingRecyclingNote[]>}
 */
const performFindByAccreditation = (storage) => async (accreditationId) => {
  const results = []
  for (const prn of storage.values()) {
    if (
      prn.accreditation?.id === accreditationId &&
      prn.status?.currentStatus !== PRN_STATUS.DELETED
    ) {
      results.push(structuredClone(prn))
    }
  }
  return results
}

/**
 * @param {PackagingRecyclingNote['status']['currentStatusAt'] | undefined} statusAt
 * @param {FindByStatusParams['dateFrom']} dateFrom
 * @param {FindByStatusParams['dateTo']} dateTo
 * @returns {boolean}
 */
const matchesDateRange = (statusAt, dateFrom, dateTo) => {
  if (!dateFrom && !dateTo) {
    return true
  }
  if (!statusAt) {
    return false
  }
  if (dateFrom && statusAt < dateFrom) {
    return false
  }
  if (dateTo && statusAt > dateTo) {
    return false
  }
  return true
}

/**
 * @param {Organisation['id'][]} excludeOrganisationIds
 * @returns {(params: Omit<FindByStatusParams, 'limit'>) =>
 *   (prn: PackagingRecyclingNote) => boolean}
 */
const buildFindByStatusFilter =
  (excludeOrganisationIds) =>
  ({ cursor, dateFrom, dateTo, statuses }) =>
  (prn) => {
    if (!statuses.includes(prn.status.currentStatus)) {
      return false
    }
    if (cursor && prn.id.localeCompare(cursor) <= 0) {
      return false
    }
    if (!matchesDateRange(prn.status.currentStatusAt, dateFrom, dateTo)) {
      return false
    }
    if (
      excludeOrganisationIds.length &&
      excludeOrganisationIds.includes(prn.organisation.id)
    ) {
      return false
    }

    return true
  }

/**
 * @param {Storage} storage
 * @param {Organisation['id'][]} excludeOrganisationIds
 * @returns {(params: FindByStatusParams) => Promise<PaginatedResult>}
 */
const performFindByStatus = (storage, excludeOrganisationIds) => {
  const buildFilter = buildFindByStatusFilter(excludeOrganisationIds)

  return async (params) => {
    const { limit } = params

    const matching = [...storage.values()]
      .filter(buildFilter(params))
      .map((prn) => structuredClone(prn))
      .sort((a, b) => a.id.localeCompare(b.id))

    const hasMore = matching.length > limit
    const items = matching.slice(0, limit)

    return {
      items,
      nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
      hasMore
    }
  }
}

/**
 * @param {Storage} storage
 * @param {TypedLogger} logger
 * @returns {(params: UpdateStatusParams) => Promise<PackagingRecyclingNote | null>}
 */
const performUpdateStatus =
  (storage, logger) =>
  async ({
    id,
    version,
    status,
    updatedBy,
    updatedAt,
    prnNumber,
    operation,
    lastAppliedEventNumber
  }) => {
    const prn = storage.get(id)
    if (!prn) {
      return null
    }

    if (prn.version !== version) {
      const conflictError = buildVersionConflictError(id, version, prn.version)
      logger.error({
        err: conflictError,
        message: `Version conflict detected for PRN ${id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.VERSION_CONFLICT_DETECTED,
          reference: id
        }
      })
      throw Boom.conflict(conflictError.message)
    }

    enforceMonotonicWatermark(
      id,
      prn.lastAppliedEventNumber,
      lastAppliedEventNumber,
      logger
    )

    if (prnNumber) {
      for (const existing of storage.values()) {
        if (existing.id !== id && existing.prnNumber === prnNumber) {
          throw new PrnNumberConflictError(prnNumber)
        }
      }
    }

    const statusUpdate = {
      ...prn.status,
      currentStatus: status,
      currentStatusAt: updatedAt,
      history: [...prn.status.history, { status, at: updatedAt, by: updatedBy }]
    }

    if (operation) {
      statusUpdate[operation.slot] = { at: operation.at, by: operation.by }
    }

    const updated = {
      ...prn,
      version: prn.version + 1,
      updatedBy,
      updatedAt,
      status: statusUpdate
    }

    if (prnNumber) {
      updated.prnNumber = prnNumber
    }

    if (lastAppliedEventNumber !== undefined) {
      updated.lastAppliedEventNumber = lastAppliedEventNumber
    }

    storage.set(id, structuredClone(updated))
    return structuredClone(updated)
  }

/**
 * @param {Storage} storage
 * @param {TypedLogger} logger
 * @param {{ revertedStatus: import('#packaging-recycling-notes/domain/model.js').PrnStatus, slotsToUnset: Array<'issued' | 'cancelled' | 'deleted'>, unsetPrnNumber?: boolean }} options
 * @returns {(params: RollbackParams) => Promise<PackagingRecyclingNote | null>}
 */
const performRollback =
  (storage, logger, { revertedStatus, slotsToUnset, unsetPrnNumber }) =>
  async ({ id, expectedVersion, updatedBy, updatedAt }) => {
    const prn = storage.get(id)
    if (!prn) {
      return null
    }

    if (prn.version !== expectedVersion) {
      const conflictError = buildVersionConflictError(
        id,
        expectedVersion,
        prn.version
      )
      logger.error({
        err: conflictError,
        message: `Version conflict detected for PRN ${id}`,
        event: {
          category: LOGGING_EVENT_CATEGORIES.DB,
          action: LOGGING_EVENT_ACTIONS.VERSION_CONFLICT_DETECTED,
          reference: id
        }
      })
      throw Boom.conflict(conflictError.message)
    }

    const statusUpdate = {
      ...prn.status,
      currentStatus: revertedStatus,
      currentStatusAt: updatedAt,
      history: [
        ...prn.status.history,
        { status: revertedStatus, at: updatedAt, by: updatedBy }
      ]
    }

    for (const slot of slotsToUnset) {
      delete statusUpdate[slot]
    }

    const updated = {
      ...prn,
      version: prn.version + 1,
      updatedBy,
      updatedAt,
      status: statusUpdate
    }

    if (unsetPrnNumber) {
      delete updated.prnNumber
    }

    storage.set(id, structuredClone(updated))
    return structuredClone(updated)
  }

/**
 * @param {PackagingRecyclingNote[]} [initialData]
 * @param {Organisation['id'][]} [excludeOrganisationIds]
 */
export function createInMemoryPackagingRecyclingNotesRepository(
  initialData = [],
  excludeOrganisationIds = []
) {
  /** @type {Storage} */
  const storage = new Map()

  for (const prn of initialData) {
    const id = prn.id
    storage.set(id, structuredClone({ ...prn, version: prn.version ?? 1, id }))
  }

  return (/** @type {TypedLogger} */ logger) => ({
    create: performCreate(storage),
    findByAccreditation: performFindByAccreditation(storage),
    findById: performFindById(storage),
    findByPrnNumber: performFindByPrnNumber(storage),
    findByStatus: performFindByStatus(storage, excludeOrganisationIds),
    updateStatus: performUpdateStatus(storage, logger),
    rollbackIssuance: performRollback(storage, logger, {
      revertedStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      slotsToUnset: ['issued'],
      unsetPrnNumber: true
    }),
    rollbackPendingCancellation: performRollback(storage, logger, {
      revertedStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      slotsToUnset: ['cancelled', 'deleted']
    }),
    rollbackIssuedCancellation: performRollback(storage, logger, {
      revertedStatus: PRN_STATUS.AWAITING_CANCELLATION,
      slotsToUnset: ['cancelled']
    })
  })
}

export function createInMemoryPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory = createInMemoryPackagingRecyclingNotesRepository(
    initialPrns,
    []
  )

  return {
    name: 'packagingRecyclingNotesRepository',
    register: (server) => {
      registerRepository(
        server,
        'packagingRecyclingNotesRepository',
        (request) => factory(request.logger)
      )
    }
  }
}
