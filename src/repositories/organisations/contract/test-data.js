import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import { createInitialStatusHistory } from '../helpers.js'

const ORG_ID_START = 500000
export const generateOrgId = () => ORG_ID_START + crypto.randomInt(0, 100000)

/**
 * Generates date constants for validFrom/validTo in YYYY-MM-DD format
 * @returns {Object} Object with VALID_FROM (today) and VALID_TO (one year from now)
 */
export const getValidDateRange = () => {
  const now = new Date()
  const oneYearFromNow = new Date(
    now.getFullYear() + 1,
    now.getMonth(),
    now.getDate()
  )
  return {
    VALID_FROM: now.toISOString().slice(0, 10),
    VALID_TO: oneYearFromNow.toISOString().slice(0, 10)
  }
}

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

  /** @type {Record<string, any>} */
  const registration = {
    ...baseRegistration,
    id: new ObjectId().toString(),
    ...overrides
  }

  if (registration.wasteProcessingType === 'exporter') {
    // Only delete glassRecyclingProcess for non-glass exporters
    if (registration.material !== 'glass') {
      delete registration.glassRecyclingProcess
    }
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
    ...overrides
  }

  if (accreditation.wasteProcessingType === 'exporter') {
    delete accreditation.site
  }
  return accreditation
}

export const buildOrganisation = (overrides = {}) => {
  // Build a mapping from old accreditation IDs to new ones
  // This ensures registration.accreditationId links are preserved
  const accreditationIdMap = new Map()
  for (const acc of org1.accreditations) {
    accreditationIdMap.set(acc.id, new ObjectId().toString())
  }

  // Deep clone accreditations with new IDs
  const accreditations = org1.accreditations.map((acc) => ({
    ...acc,
    id: accreditationIdMap.get(acc.id)
  }))

  // Deep clone registrations with new IDs, updating accreditationId links
  const registrations = org1.registrations.map((reg) => ({
    ...reg,
    id: new ObjectId().toString(),
    // Update accreditationId to point to the new accreditation ID
    ...(reg.accreditationId && {
      accreditationId: accreditationIdMap.get(reg.accreditationId)
    })
  }))

  const org = {
    ...org1,
    orgId: generateOrgId(),
    id: new ObjectId().toString(),
    statusHistory: createInitialStatusHistory(),
    registrations,
    accreditations,
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
export const buildLinkedDefraOrg = (orgId, orgName) => ({
  orgId,
  orgName,
  linkedBy: {
    email: 'linker@example.com',
    id: crypto.randomUUID()
  },
  linkedAt: new Date().toISOString()
})

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
