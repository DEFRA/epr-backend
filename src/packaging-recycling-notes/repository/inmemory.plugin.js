import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { registerRepository } from '#plugins/register-repository.js'
import { ObjectId } from 'mongodb'
import { PrnNumberConflictError } from './port.js'
import { validatePrnInsert } from './validation.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { PackagingRecyclingNote } from '../domain/model.js' */
/** @import { FindByStatusParams, PaginatedResult, UpdateStatusParams } from './port.js' */

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
      nextCursor: hasMore ? items.at(-1).id : null,
      hasMore
    }
  }
}

/**
 * @param {Storage} storage
 * @returns {(params: UpdateStatusParams) => Promise<PackagingRecyclingNote | null>}
 */
const performUpdateStatus =
  (storage) =>
  async ({ id, status, updatedBy, updatedAt, prnNumber, operation }) => {
    const prn = storage.get(id)
    if (!prn) {
      return null
    }

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
      updatedBy,
      updatedAt,
      status: statusUpdate
    }

    if (prnNumber) {
      updated.prnNumber = prnNumber
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
    const id = prn._id?.toString() ?? prn.id
    storage.set(id, structuredClone({ ...prn, id }))
  }

  return () => ({
    create: performCreate(storage),
    findByAccreditation: performFindByAccreditation(storage),
    findById: performFindById(storage),
    findByPrnNumber: performFindByPrnNumber(storage),
    findByStatus: performFindByStatus(storage, excludeOrganisationIds),
    updateStatus: performUpdateStatus(storage)
  })
}

export function createInMemoryPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory = createInMemoryPackagingRecyclingNotesRepository(
    initialPrns,
    []
  )
  const repository = factory()

  return {
    name: 'packagingRecyclingNotesRepository',
    register: (server) => {
      registerRepository(
        server,
        'packagingRecyclingNotesRepository',
        () => repository
      )
    }
  }
}
