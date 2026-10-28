import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }
import { createInitialStatusHistory } from '../helpers.js'
import { getCurrentStatus } from '../status.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import {
  toAccreditationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Organisation, OrganisationStatus} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

const ORG_ID_START = 500000

/**
 * Generates date constants for validFrom/validTo in YYYY-MM-DD format
 * @returns {{ VALID_FROM: string, VALID_TO: string }} Object with VALID_FROM (today) and VALID_TO (one year from now)
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
      if (!item.statusHistory) {
        item.statusHistory = createInitialStatusHistory()
      }
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
    delete registration.overseasSites
  }

  if (!overrides.accreditationId) {
    delete registration.accreditationId
  }

  return registration
}

/**
 * @param {Partial<Accreditation>} [overrides]
 * @returns {Accreditation}
 */
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
  // @ts-expect-error JSON fixture has widened types (string vs union literals)
  return accreditation
}

/**
 * @param {number} orgId
 * @returns {Omit<Organisation, 'status'>}
 */
const buildOrganisationWithOrgId = (orgId, overrides = {}) => {
  // Build a mapping from old accreditation IDs to new ones
  // This ensures registration.accreditationId links are preserved
  const accreditationIdMap = new Map()
  for (const acc of org1.accreditations) {
    accreditationIdMap.set(acc.id, new ObjectId().toString())
  }

  // Deep clone accreditations with new IDs and properly typed fields
  const accreditations = org1.accreditations.map((acc) => ({
    ...acc,
    id: accreditationIdMap.get(acc.id),
    formSubmission: {
      id: accreditationIdMap.get(acc.id),
      time: new Date(acc.formSubmission.time)
    },
    statusHistory: createInitialStatusHistory()
  }))

  // Deep clone registrations with new IDs, updating accreditationId links
  const registrations = org1.registrations.map((reg) => ({
    ...reg,
    id: new ObjectId().toString(),
    formSubmission: {
      id: reg.formSubmission.id,
      time: new Date(reg.formSubmission.time)
    },
    statusHistory: createInitialStatusHistory(),
    // Update accreditationId to point to the new accreditation ID
    ...(reg.accreditationId && {
      accreditationId: accreditationIdMap.get(reg.accreditationId)
    })
  }))

  const org = {
    ...org1,
    orgId,
    id: new ObjectId().toString(),
    formSubmission: {
      id: org1.formSubmission.id,
      time: new Date(org1.formSubmission.time)
    },
    partnership: org1.partnership,
    statusHistory: createInitialStatusHistory(),
    registrations,
    accreditations,
    ...overrides
  }

  initializeStatusForItems(org.registrations)
  initializeStatusForItems(org.accreditations)

  // @ts-expect-error JSON fixture has widened types (string vs union literals) and the
  // Accreditation/Registration types require computed 'status' that only exists after read
  return org
}

/**
 * Gives the organisation the given company name, its first registration the
 * given registration number and its first accreditation the given
 * accreditation number, so the registration/accreditation links stay intact.
 *
 * @param {Omit<Organisation, 'status'>} base
 * @param {{ name: string, registrationNumber?: string, accreditationNumber?: string }} criteria
 * @returns {Omit<Organisation, 'status'>}
 */
const withCriteria = (
  base,
  { name, registrationNumber, accreditationNumber }
) => ({
  ...base,
  companyDetails: { ...base.companyDetails, name },
  registrations: base.registrations.map((registration, index) =>
    index === 0 && registrationNumber !== undefined
      ? {
          ...registration,
          registrationNumber: toRegistrationNumber(registrationNumber)
        }
      : registration
  ),
  accreditations: base.accreditations.map((accreditation, index) =>
    index === 0 && accreditationNumber !== undefined
      ? {
          ...accreditation,
          accreditationNumber: toAccreditationNumber(accreditationNumber)
        }
      : accreditation
  )
})

/**
 * Adds the computed top-level and nested 'status' fields the read path
 * derives from statusHistory.
 *
 * @param {Omit<Organisation, 'status'>} org
 * @param {Partial<Organisation>} overrides
 * @returns {Organisation}
 */
const asRead = (org, overrides) => {
  for (const registration of org.registrations) {
    registration.status = registration.status ?? getCurrentStatus(registration)
  }
  for (const accreditation of org.accreditations) {
    accreditation.status =
      accreditation.status ?? getCurrentStatus(accreditation)
  }

  return {
    ...org,
    status:
      overrides.status ??
      /** @type {OrganisationStatus} */ (getCurrentStatus(org))
  }
}

/**
 * @param {Registration} registration
 * @param {'created'|'approved'|'suspended'} [accreditationStatus]
 */
const registrationOverrides = (registration, accreditationStatus) => {
  const orgOptions = { registrations: [registration] }

  if (accreditationStatus && registration.accreditationId) {
    const accreditation = buildAccreditation({
      id: registration.accreditationId,
      wasteProcessingType: registration.wasteProcessingType,
      statusHistory: [
        { status: 'created', updatedAt: '2024-01-01' },
        { status: accreditationStatus, updatedAt: '2024-02-01' }
      ]
    })
    orgOptions.accreditations = [accreditation]
  }

  return orgOptions
}

/**
 * Builds organisations whose orgIds come from one sequence, which nextOrgId
 * also hands out. Organisations built by one set of builders never share an
 * orgId, so a test that starts from an empty repository can insert them
 * without hitting the repository's unique orgId index.
 */
export const createOrganisationBuilders = () => {
  let lastOrgId = ORG_ID_START - 1
  const nextOrgId = () => {
    lastOrgId += 1
    return lastOrgId
  }

  /** @returns {Omit<Organisation, 'status'>} */
  const buildOrganisation = (overrides = {}) =>
    buildOrganisationWithOrgId(nextOrgId(), overrides)

  /**
   * Builds an organisation with a known company name.
   *
   * @param {string} name
   */
  const buildOrgWithName = (name) => withCriteria(buildOrganisation(), { name })

  /**
   * Builds an organisation carrying known search criteria. Everything else is
   * left as buildOrganisation makes it.
   *
   * @param {{
   *   name?: string,
   *   orgId?: number,
   *   registrationNumber?: string,
   *   accreditationNumber?: string
   * }} [criteria]
   */
  const buildOrgWithCriteria = ({
    name = 'Criteria Ltd',
    orgId,
    ...numbers
  } = {}) =>
    withCriteria(buildOrganisation(orgId === undefined ? {} : { orgId }), {
      name,
      ...numbers
    })

  /**
   * Builds an organisation as returned from a repository read. Use this for
   * tests that consume an organisation (vs insert it).
   *
   * @param {Partial<Organisation>} [overrides]
   */
  const buildReadOrganisation = (overrides = {}) =>
    asRead(buildOrganisation(overrides), overrides)

  /**
   * Builds an organisation with the given registration, optionally linking a
   * matching accreditation with a specific status. When accreditationStatus is
   * provided, the returned org should be passed as an initial org to
   * createInMemoryOrganisationsRepository — otherwise insert() will overwrite
   * the statusHistory with the default 'created' entry.
   *
   * @param {Registration} registration - From buildRegistration
   * @param {'created'|'approved'|'suspended'} [accreditationStatus] - If set, links a matching accreditation
   */
  const buildOrganisationWithRegistration = (
    registration,
    accreditationStatus
  ) =>
    buildOrganisation(registrationOverrides(registration, accreditationStatus))

  /**
   * Builds an organisation holding a numbered registration, and a numbered
   * accreditation of it, under the given ids, so a document stored with those
   * ids can be given their numbers.
   *
   * @param {{ organisationId: string, registrationId: string, accreditationId: string }} ids
   */
  const buildOrganisationHolding = ({
    organisationId,
    registrationId,
    accreditationId
  }) =>
    buildOrganisation({
      id: organisationId,
      registrations: [
        buildRegistration({
          id: registrationId,
          registrationNumber: toRegistrationNumber(`REG-${registrationId}`),
          accreditationId
        })
      ],
      accreditations: [
        buildAccreditation({
          id: accreditationId,
          accreditationNumber: toAccreditationNumber(`ACC-${accreditationId}`)
        })
      ]
    })

  return {
    nextOrgId,
    buildOrganisation,
    buildOrganisationHolding,
    buildOrgWithName,
    buildOrgWithCriteria,
    buildReadOrganisation,
    buildOrganisationWithRegistration
  }
}

/** @typedef {ReturnType<typeof createOrganisationBuilders>} OrganisationBuilders */

const mergeArrayById = (existing, updates) => {
  const updatesById = new Map(updates.map((item) => [item.id, item]))
  const merged = existing.map((item) => updatesById.get(item.id) || item)
  const newItems = updates.filter(
    (item) => !existing.some((e) => e.id === item.id)
  )
  return [...merged, ...newItems]
}

/**
 * @param {string} orgId
 * @param {string} orgName
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

/**
 * The organisation number an organisation is addressed by.
 *
 * @param {{ orgId: number }} organisation
 */
export const numberOf = ({ orgId }) => toOrganisationNumber(String(orgId))

/**
 * What an update at a stale version rejects with.
 *
 * @param {number} version
 * @param {number} currentVersion
 */
export const versionConflict = (version, currentVersion) => ({
  isBoom: true,
  output: {
    statusCode: 409,
    payload: {
      message: `Version conflict: attempted to update with version ${version} but current version is ${currentVersion}`
    }
  }
})

/** What an update of an organisation that does not exist rejects with. */
export const notFound = { isBoom: true, output: { statusCode: 404 } }

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
