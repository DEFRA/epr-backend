import {
  validateId,
  validateOrganisationInsert,
  validateOrganisationUpdate
} from './validation.js'
import {
  SCHEMA_VERSION,
  createInitialStatusHistory,
  getCurrentStatus,
  statusHistoryWithChanges,
  mergeSubcollection
} from './helpers.js'
import Boom from '@hapi/boom'

/**
 * @typedef {{ id: string, [key: string]: any }} Organisation
 */

const enrichItemsWithStatus = (items) => {
  for (const item of items) {
    item.status = getCurrentStatus(item)
  }
}

const enrichWithCurrentStatus = (org) => {
  org.status = getCurrentStatus(org)
  enrichItemsWithStatus(org.registrations)
  enrichItemsWithStatus(org.accreditations)
  return org
}

const initializeItems = (items) =>
  items?.map((item) => ({
    ...item,
    formSubmissionTime: new Date(item.formSubmissionTime),
    statusHistory: createInitialStatusHistory()
  })) || []

const performInsert = (storage, organisation) => {
  const validated = validateOrganisationInsert(organisation)
  const { id, ...orgFields } = validated

  const existing = storage.find((o) => o.id === id)
  if (existing) {
    throw Boom.conflict(`Organisation with ${id} already exists`)
  }

  const registrations = initializeItems(orgFields.registrations)
  const accreditations = initializeItems(orgFields.accreditations)

  storage.push(
    structuredClone({
      id,
      version: 1,
      schemaVersion: SCHEMA_VERSION,
      statusHistory: createInitialStatusHistory(),
      ...orgFields,
      formSubmissionTime: new Date(orgFields.formSubmissionTime),
      registrations,
      accreditations
    })
  )
}

const performUpdate = (storage, id, version, updates) => {
  const validatedId = validateId(id)
  const validatedUpdates = validateOrganisationUpdate(updates)

  const existingIndex = storage.findIndex((o) => o.id === validatedId)
  if (existingIndex === -1) {
    throw Boom.notFound(`Organisation with id ${validatedId} not found`)
  }

  const existing = storage[existingIndex]

  if (existing.version !== version) {
    throw Boom.conflict(
      `Version conflict: attempted to update with version ${version} but current version is ${existing.version}`
    )
  }

  const merged = {
    ...existing,
    ...validatedUpdates
  }

  const registrations = mergeSubcollection(
    existing.registrations,
    validatedUpdates.registrations
  )
  const accreditations = mergeSubcollection(
    existing.accreditations,
    validatedUpdates.accreditations
  )

  storage[existingIndex] = {
    ...merged,
    statusHistory: statusHistoryWithChanges(validatedUpdates, existing),
    registrations,
    accreditations,
    version: existing.version + 1
  }
}

const performFindById = (storage, id) => {
  try {
    validateId(id)
  } catch (validationError) {
    throw Boom.notFound(`Organisation with id ${id} not found`, {
      cause: validationError
    })
  }

  const found = storage.find((o) => o.id === id)
  if (!found) {
    throw Boom.notFound(`Organisation with id ${id} not found`)
  }

  return enrichWithCurrentStatus(structuredClone(found))
}

/**
 * Create an in-memory organisations repository.
 * Ensures data isolation by deep-cloning on store and on read.
 *
 * @param {Organisation[]} [initialOrganisations=[]]
 * @returns {import('./port.js').OrganisationsRepositoryFactory}
 */
export const createInMemoryOrganisationsRepository = (
  initialOrganisations = []
) => {
  const storage = structuredClone(initialOrganisations)

  return () => ({
    async insert(organisation) {
      return performInsert(storage, organisation)
    },

    async update(id, version, updates) {
      return performUpdate(storage, id, version, updates)
    },

    async findAll() {
      return structuredClone(storage).map((org) =>
        enrichWithCurrentStatus({ ...org })
      )
    },

    async findById(id) {
      return performFindById(storage, id)
    },

    async findRegistrationById(organisationId, registrationId) {
      const org = storage.find((o) => o.id === organisationId)
      if (!org) {
        return null
      }

      const registration = org.registrations?.find(
        (r) => r.id === registrationId
      )
      return registration ? structuredClone(registration) : null
    }
  })
}
