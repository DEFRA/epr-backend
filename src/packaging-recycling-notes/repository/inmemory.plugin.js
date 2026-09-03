import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/event.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { registerDependency } from '#plugins/register-dependency.js'
import Boom from '@hapi/boom'
import { ObjectId } from 'mongodb'
import { PrnNumberConflictError, PRN_VERSION_CONFLICT } from './port.js'
import { validatePrnInsert } from './validation.js'
import {
  isWatermarkRegression,
  throwWatermarkRegression
} from './watermark-guard.js'

/** @import { TypedLogger } from '#common/hapi-types.js' */
/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { PackagingRecyclingNote } from '../domain/model.js' */
/** @import { FindByStatusParams, PaginatedResult, PersistProjectionParams, UpdateStatusParams, UpdateWatermarkParams } from './port.js' */

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
 * Throws the tagged version conflict a CAS write raises when the stored version
 * has moved on. Centralised so the message, log event and error stay identical
 * across the adapter's writes, matching the mongo adapter's guard.
 *
 * @param {TypedLogger} logger
 * @param {string} id
 * @param {number} expectedVersion
 * @param {number} actualVersion
 */
const assertVersion = (logger, id, expectedVersion, actualVersion) => {
  if (actualVersion === expectedVersion) {
    return
  }
  const conflictError = buildVersionConflictError(
    id,
    expectedVersion,
    actualVersion
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
  throw Boom.conflict(conflictError.message, { kind: PRN_VERSION_CONFLICT })
}

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
  if (isWatermarkRegression(storedEventNumber, incomingEventNumber)) {
    throwWatermarkRegression(id, storedEventNumber, incomingEventNumber, logger)
  }
}

/**
 * @param {Storage} storage
 * @returns {(accreditationId: import('./port.js').AccreditationId) => Promise<PackagingRecyclingNote[]>}
 */
const performFindByAccreditation =
  (storage) =>
  async ({ organisationId, registrationId, accreditationId }) => {
    const results = []
    for (const prn of storage.values()) {
      if (
        prn.organisation?.id === organisationId &&
        prn.registrationId === registrationId &&
        prn.accreditation?.id === accreditationId &&
        prn.status?.currentStatus !== PRN_STATUS.DELETED
      ) {
        results.push(structuredClone(prn))
      }
    }
    return results
  }

const performFindByIds =
  (storage) =>
  async ({ organisationId, registrationId, accreditationId, ids }) => {
    const wanted = new Set(ids)
    const results = []
    for (const prn of storage.values()) {
      if (
        wanted.has(prn.id) &&
        prn.organisation?.id === organisationId &&
        prn.registrationId === registrationId &&
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

    assertVersion(logger, id, version, prn.version)

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
 * @returns {(params: UpdateWatermarkParams) => Promise<PackagingRecyclingNote | null>}
 */
const performUpdateWatermark =
  (storage, logger) =>
  async ({ id, version, lastAppliedEventNumber }) => {
    const prn = storage.get(id)
    if (!prn) {
      return null
    }

    assertVersion(logger, id, version, prn.version)

    enforceMonotonicWatermark(
      id,
      prn.lastAppliedEventNumber,
      lastAppliedEventNumber,
      logger
    )

    const updated = {
      ...prn,
      version: prn.version + 1,
      lastAppliedEventNumber
    }

    storage.set(id, structuredClone(updated))
    return structuredClone(updated)
  }

/**
 * @param {Storage} storage
 * @param {TypedLogger} logger
 * @returns {(params: PersistProjectionParams) => Promise<PackagingRecyclingNote | null>}
 */
const performPersistProjection =
  (storage, logger) =>
  async ({ projection, expectedVersion }) => {
    const id = projection.id
    const existing = storage.get(id)
    if (!existing) {
      return null
    }

    assertVersion(logger, id, expectedVersion, existing.version)

    enforceMonotonicWatermark(
      id,
      existing.lastAppliedEventNumber,
      projection.lastAppliedEventNumber,
      logger
    )

    if (projection.prnNumber) {
      for (const other of storage.values()) {
        if (other.id !== id && other.prnNumber === projection.prnNumber) {
          throw new PrnNumberConflictError(projection.prnNumber)
        }
      }
    }

    const persisted = { ...projection, id, version: expectedVersion + 1 }
    storage.set(id, structuredClone(persisted))
    return structuredClone(persisted)
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
    findByIds: performFindByIds(storage),
    findById: performFindById(storage),
    findByPrnNumber: performFindByPrnNumber(storage),
    findByStatus: performFindByStatus(storage, excludeOrganisationIds),
    updateStatus: performUpdateStatus(storage, logger),
    updateWatermark: performUpdateWatermark(storage, logger),
    persistProjection: performPersistProjection(storage, logger)
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
      registerDependency(
        server,
        'packagingRecyclingNotesRepository',
        (request) => factory(request.logger)
      )
    }
  }
}
