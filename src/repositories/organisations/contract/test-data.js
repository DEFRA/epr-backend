import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import { createInitialStatusHistory } from '../helpers.js'

const ORG_ID_START = 500000
export const generateOrgId = () => ORG_ID_START + crypto.randomInt(0, 100000)

function initializeStatusForItems(items) {
  if (Array.isArray(items)) {
    for (const item of items) {
      item.statusHistory = createInitialStatusHistory()
    }
  }
}

export const buildRegistration = (overrides = {}) => {
  const desiredType = overrides.wasteProcessingType || 'reprocessor'
  const baseRegistrationIndex = desiredType === 'exporter' ? 1 : 0

  const baseRegistration = org1.registrations[baseRegistrationIndex]

  const registration = {
    ...baseRegistration,
    id: new ObjectId().toString(),
    ...overrides
  }

  if (registration.wasteProcessingType === 'exporter') {
    delete registration.glassRecyclingProcess
    delete registration.site
    delete registration.wasteManagementPermits
    delete registration.yearlyMetrics
    delete registration.plantEquipmentDetails
  }

  if (registration.wasteProcessingType === 'reprocessor') {
    delete registration.exportPorts
    delete registration.orsFileUploads
  }

  return registration
}

export const buildAccreditation = (overrides = {}) => {
  const baseAccreditation = org1.accreditations[0]

  const accreditation = {
    ...baseAccreditation,
    id: new ObjectId().toString(),
    accreditationNumber: '87654321',
    ...overrides
  }

  if (accreditation.wasteProcessingType === 'exporter') {
    delete accreditation.site
  }
  return accreditation
}

export const buildOrganisation = (overrides = {}) => {
  const org = {
    ...org1,
    orgId: generateOrgId(),
    id: new ObjectId().toString(),
    statusHistory: createInitialStatusHistory(),
    ...overrides
  }

  initializeStatusForItems(org.registrations)
  initializeStatusForItems(org.accreditations)

  return org
}

const mergeArrayById = (existing, updates) => {
  const updatesById = new Map(updates.map((item) => [item.id, item]))
  const merged = existing.map((item) => updatesById.get(item.id) || item)
  const newItems = updates.filter(
    (item) => !existing.some((e) => e.id === item.id)
  )
  return [...merged, ...newItems]
}

/**
 * Builds a replacement object for organisationsRepository.replace()
 * Removes the id field and merges updates
 * Smartly merges registrations/accreditations by ID: updates existing, adds new
 *
 * @param {Object} org - Current organisation object
 * @param {Object} updates - Fields to update
 * @returns {Object} Organisation object without id, ready for replace()
 */
export const prepareOrgUpdate = (org, updates = {}) => {
  const { id: _, ...orgWithoutId } = org

  const result = {
    ...orgWithoutId,
    ...updates
  }

  if (updates.registrations) {
    result.registrations = mergeArrayById(
      org.registrations,
      updates.registrations
    )
  }

  if (updates.accreditations) {
    result.accreditations = mergeArrayById(
      org.accreditations,
      updates.accreditations
    )
  }

  return result
}
