import { ObjectId } from 'mongodb'
import { registerRepository } from '#plugins/register-repository.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from './port.js'

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
  const id = new ObjectId().toHexString()
  const prnWithId = { ...prn, id }
  storage.set(id, structuredClone(prnWithId))
  return structuredClone(prnWithId)
}

const performFindByAccreditation = (storage) => async (accreditationId) => {
  const results = []
  for (const prn of storage.values()) {
    if (
      prn.accreditationId === accreditationId &&
      prn.status?.currentStatus !== PRN_STATUS.DELETED
    ) {
      results.push(structuredClone(prn))
    }
  }
  return results
}

const performUpdateStatus =
  (storage) =>
  async ({
    id,
    status,
    updatedBy,
    updatedAt,
    prnNumber,
    issuedAt,
    issuedBy
  }) => {
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

    const updated = {
      ...prn,
      updatedBy,
      updatedAt,
      status: {
        currentStatus: status,
        history: [...prn.status.history, { status, updatedAt, updatedBy }]
      }
    }

    if (prnNumber) {
      updated.prnNumber = prnNumber
    }

    if (issuedAt) {
      updated.issuedAt = issuedAt
    }

    if (issuedBy) {
      updated.issuedBy = issuedBy
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
