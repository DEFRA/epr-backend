import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate,
  validateStatusHistory
} from './validation.js'
import Boom from '@hapi/boom'

const COLLECTION_NAME = 'epr-organisations'
const MONGODB_DUPLICATE_KEY_ERROR_CODE = 11000
const SCHEMA_VERSION = 1

const createStatusHistoryEntry = (status) => ({
  status,
  updatedAt: new Date()
})

const createInitialStatusHistory = () => {
  const statusHistory = [createStatusHistoryEntry('created')]
  return validateStatusHistory(statusHistory)
}

const getCurrentStatus = (existingItem) => {
  return existingItem.statusHistory.at(-1).status
}

const mapDocumentWithCurrentStatuses = (org) => {
  const { _id, ...rest } = org

  rest.status = getCurrentStatus(rest)

  for (const item of rest.registrations ?? []) {
    item.status = getCurrentStatus(item)
  }

  for (const item of rest.accreditations ?? []) {
    item.status = getCurrentStatus(item)
  }
  return { id: _id.toString(), ...rest }
}

const statusHistoryWithChanges = (updatedItem, existingItem) => {
  let statusHistory = createInitialStatusHistory()
  if (existingItem) {
    if (
      updatedItem.status &&
      updatedItem.status !== getCurrentStatus(existingItem)
    ) {
      statusHistory = [
        ...existingItem.statusHistory,
        createStatusHistoryEntry(updatedItem.status)
      ]
    } else {
      statusHistory = existingItem.statusHistory
    }
  }
  return validateStatusHistory(statusHistory)
}

/**
 * Merges registrations/accreditations updates with existing.
 * @param {Array} existingItems - Current registrations/accreditations from database
 * @param {Array} itemUpdates - registrations/accreditations to update or add
 * @returns {Array} Merged array with updated and registrations/accreditations
 */
const mergeItemsWithUpdates = (existingItems, itemUpdates) => {
  const updatesById = new Map(itemUpdates.map((item) => [item.id, item]))

  const processedExisting = existingItems.map((existingItem) => {
    const update = updatesById.get(existingItem.id)
    if (update) {
      updatesById.delete(existingItem.id) // Mark as processed
      return {
        ...existingItem,
        ...update,
        statusHistory: statusHistoryWithChanges(update, existingItem)
      }
    }
    return existingItem
  })

  const newItems = Array.from(updatesById.values()).map((newItem) => ({
    ...newItem,
    statusHistory: createInitialStatusHistory()
  }))

  return [...processedExisting, ...newItems]
}

const performInsert = async (db, organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, ...orgFields } = validated

  const registrations =
    orgFields.registrations?.map((reg) => ({
      ...reg,
      statusHistory: createInitialStatusHistory()
    })) || []

  const accreditations =
    orgFields.accreditations?.map((acc) => ({
      ...acc,
      statusHistory: createInitialStatusHistory()
    })) || []

  try {
    await db.collection(COLLECTION_NAME).insertOne({
      _id: id,
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      statusHistory: createInitialStatusHistory(),
      ...orgFields,
      registrations,
      accreditations
    })
  } catch (error) {
    if (error.code === MONGODB_DUPLICATE_KEY_ERROR_CODE) {
      throw Boom.conflict(`Organisation with ${id} already exists`)
    }
    throw error
  }
}

const performUpdate = async (db, id, version, updates) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateOrganisationUpdate(updates)

  const existing = await db
    .collection(COLLECTION_NAME)
    .findOne({ _id: validatedId })

  if (!existing) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  const merged = {
    ...existing,
    ...validatedUpdates
  }

  const registrations = validatedUpdates.registrations
    ? mergeItemsWithUpdates(
        existing.registrations,
        validatedUpdates.registrations
      )
    : existing.registrations

  const accreditations = validatedUpdates.accreditations
    ? mergeItemsWithUpdates(
        existing.accreditations,
        validatedUpdates.accreditations
      )
    : existing.accreditations

  const result = await db.collection(COLLECTION_NAME).updateOne(
    { _id: validatedId, version },
    {
      $set: {
        ...merged,
        statusHistory: statusHistoryWithChanges(validatedUpdates, existing),
        registrations,
        accreditations,
        version: existing.version + 1
      }
    }
  )

  if (result.matchedCount === 0) {
    throw Boom.conflict(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
  }
}

const performFindById = async (db, id) => {
  // validate the ID and throw early
  try {
    validateId(id)
  } catch (error) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  const doc = await db.collection(COLLECTION_NAME).findOne({ _id: id })
  if (!doc) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  return mapDocumentWithCurrentStatuses(doc)
}

const performFindAll = async (db) => {
  const docs = await db.collection(COLLECTION_NAME).find().toArray()
  return docs.map((doc) => mapDocumentWithCurrentStatuses(doc))
}

/**
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createOrganisationsRepository = (db) => () => ({
  async insert(organisation) {
    return performInsert(db, organisation)
  },

  async update(id, version, updates) {
    return performUpdate(db, id, version, updates)
  },

  async findById(id) {
    return performFindById(db, id)
  },

  async findAll() {
    return performFindAll(db)
  }
})
