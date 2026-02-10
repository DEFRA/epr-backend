import { ObjectId } from 'mongodb'
import { registerRepository } from '#plugins/register-repository.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from './port.js'
import { validatePrnInsert } from './validation.js'

const performFindById = (storage) => async (id) => {
  const prn = storage.get(id)
  return prn ? structuredClone(prn) : null
}

const performFindByPrnNumber = (storage) => async (prnNumber) => {
  for (const prn of storage.values()) {
    if (prn.prnNumber === prnNumber) {
      return structuredClone(prn)
    }
  }
  return null
}

const performCreate = (storage) => async (prn) => {
  const validated = validatePrnInsert(prn)
  const id = new ObjectId().toHexString()
  const prnWithId = { ...validated, id }
  storage.set(id, structuredClone(prnWithId))
  return structuredClone(prnWithId)
}

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

const performFindByStatus =
  (storage) =>
  async ({ statuses, dateFrom, dateTo, cursor, limit }) => {
    const matching = []
    for (const prn of storage.values()) {
      const matchesStatus = statuses.includes(prn.status.currentStatus)
      const afterCursor = !cursor || prn.id > cursor
      const matchesDate = matchesDateRange(
        prn.status.currentStatusAt,
        dateFrom,
        dateTo
      )

      if (matchesStatus && afterCursor && matchesDate) {
        matching.push(structuredClone(prn))
      }
    }

    matching.sort((a, b) => a.id.localeCompare(b.id))

    const hasMore = matching.length > limit
    const items = matching.slice(0, limit)

    return {
      items,
      nextCursor: hasMore ? items.at(-1).id : null,
      hasMore
    }
  }

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

export function createInMemoryPackagingRecyclingNotesRepository(
  initialData = []
) {
  const storage = new Map()

  for (const prn of initialData) {
    const id = prn._id?.toString() ?? prn.id
    storage.set(id, structuredClone({ ...prn, id }))
  }

  return () => ({
    findById: performFindById(storage),
    findByPrnNumber: performFindByPrnNumber(storage),
    create: performCreate(storage),
    findByAccreditation: performFindByAccreditation(storage),
    findByStatus: performFindByStatus(storage),
    updateStatus: performUpdateStatus(storage)
  })
}

export function createInMemoryPackagingRecyclingNotesRepositoryPlugin(
  initialPrns
) {
  const factory = createInMemoryPackagingRecyclingNotesRepository(initialPrns)
  const repository = factory()

  return {
    name: 'lumpyPackagingRecyclingNotesRepository',
    register: (server) => {
      registerRepository(
        server,
        'lumpyPackagingRecyclingNotesRepository',
        () => repository
      )
    }
  }
}
