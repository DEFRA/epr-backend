import { ObjectId } from 'mongodb'
import { expect } from 'vitest'

import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'

export const REPROCESSOR_NUMBER = toRegistrationNumber('R26ER5001180041PL')
export const EXPORTER_NUMBER = toRegistrationNumber('R26EX5001180042PL')
export const ACCREDITATION_NUMBER = toAccreditationNumber('A26ER5001180114PL')
export const EXPORTER_ACCREDITATION_NUMBER =
  toAccreditationNumber('A26EX5001180115PL')

export const APPROVED_SITE_ID = new ObjectId().toString()
export const PENDING_SITE_ID = new ObjectId().toString()
export const MISSING_SITE_ID = new ObjectId().toString()

export const approvedSite = {
  id: APPROVED_SITE_ID,
  name: 'Beta Reprocessor',
  country: 'Germany',
  address: { line1: '2 Teststrasse', townOrCity: 'Berlin', postcode: '10115' },
  coordinates: '52.5200,13.4050',
  validFrom: new Date('2026-01-01T00:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date()
}

export const pendingSite = {
  id: PENDING_SITE_ID,
  name: 'Alpha Reprocessor',
  country: 'France',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', line2: null },
  createdAt: new Date(),
  updatedAt: new Date()
}

export const overseasSites = [approvedSite, pendingSite]

/** @import { Accreditation as StoredAccreditation } from '#domain/organisations/accreditation.js' */
/** @import { Registration as StoredRegistration } from '#domain/organisations/registration.js' */
/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { StoredRegOrAccStatus } from '#domain/organisations/model.js' */
/** @import { Organisation, Status, StatusTimeline } from '#organisation-read-model/domain/model.js' */
/** @import { FindByYearOptions, OrganisationReadRepository } from '../port.js' */

/**
 * @param {OrganisationReadRepository} repository
 * @param {string} organisationNumber
 * @param {FindByYearOptions} [options]
 * @returns {Promise<Organisation>}
 */
export const findOrganisation = async (
  repository,
  organisationNumber,
  options
) => {
  const organisation = await repository.findByOrganisationNumber(
    toOrganisationNumber(organisationNumber),
    options
  )
  expect(organisation).not.toBeNull()
  return /** @type {Organisation} */ (organisation)
}

/**
 * @template {StoredRegOrAccStatus} S
 * @param {S} status
 * @returns {StatusHistoryEntryOf<'created' | S>[]}
 */
export const granted = (status) => [
  { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
  { status, updatedAt: GRANTED_AT }
]

/**
 * When the approval of a record built with `granted('approved')` was recorded.
 */
export const GRANTED_AT = '2026-02-01T09:00:00.000Z'

/**
 * The timeline of a record built with `granted('approved')`.
 *
 * @param {string} validFrom
 * @returns {StatusTimeline<'approved'>}
 */
export const approvedTimeline = (validFrom) => [
  { status: 'approved', at: new Date(validFrom).toISOString() }
]

/**
 * The status of a record built with `granted('approved')`.
 *
 * @param {string} validFrom
 * @returns {Status<'approved'>}
 */
export const approvedStatus = (validFrom) => ({
  current: 'approved',
  lastUpdatedAt: GRANTED_AT,
  timeline: approvedTimeline(validFrom)
})

/**
 * @param {Partial<StoredAccreditation>} [overrides]
 * @returns {StoredAccreditation}
 */
export const accreditation = (overrides = {}) =>
  buildAccreditation({
    accreditationNumber: toAccreditationNumber(ACCREDITATION_NUMBER),
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: granted('approved'),
    ...overrides
  })

/**
 * @param {Partial<StoredAccreditation>} [overrides]
 * @returns {StoredAccreditation}
 */
export const exporterAccreditation = (overrides = {}) =>
  accreditation({
    wasteProcessingType: 'exporter',
    accreditationNumber: toAccreditationNumber(EXPORTER_ACCREDITATION_NUMBER),
    ...overrides
  })

/**
 * @param {Partial<StoredRegistration>} [overrides]
 * @returns {StoredRegistration}
 */
export const reprocessor = (overrides = {}) =>
  /** @type {StoredRegistration} */ (
    buildRegistration({
      registrationNumber: REPROCESSOR_NUMBER,
      reprocessingType: 'input',
      validFrom: '2026-02-01',
      statusHistory: granted('approved'),
      ...overrides
    })
  )

/**
 * @param {Partial<StoredRegistration>} [overrides]
 * @returns {StoredRegistration}
 */
export const exporter = (overrides = {}) =>
  /** @type {StoredRegistration} */ (
    buildRegistration({
      wasteProcessingType: 'exporter',
      registrationNumber: EXPORTER_NUMBER,
      validFrom: '2026-02-01',
      statusHistory: granted('approved'),
      overseasSites: {
        '001': { overseasSiteId: APPROVED_SITE_ID },
        '002': { overseasSiteId: PENDING_SITE_ID }
      },
      ...overrides
    })
  )

/**
 * A stored record missing a field its type requires, as malformed data
 * reaches the read model.
 *
 * @template {object} T
 * @param {T} record
 * @param {keyof T} key
 * @returns {T}
 */
export const storedWithout = (record, key) => {
  const { [key]: _, ...rest } = record
  return /** @type {T} */ (rest)
}

/**
 * @param {StoredRegistration['site']['address']} address
 */
export const reprocessorAt = (address) => {
  const registration = reprocessor()
  return { ...registration, site: { ...registration.site, address } }
}

export const approvedOverseasSite = {
  name: 'Beta Reprocessor',
  address: {
    line1: '2 Teststrasse',
    townOrCity: 'Berlin',
    postcode: '10115',
    country: 'Germany'
  },
  coordinates: '52.5200,13.4050',
  validFrom: '2026-01-01T00:00:00.000Z'
}

export const pendingOverseasSite = {
  name: 'Alpha Reprocessor',
  address: { line1: '1 Rue de Test', townOrCity: 'Paris', country: 'France' }
}

export const luke = {
  email: 'luke.skywalker@starwars.com',
  fullName: 'Luke Skywalker',
  phone: '1234567890'
}

export const anakin = {
  email: 'anakin.skywalker@starwars.com',
  fullName: 'Anakin Skywalker',
  phone: '823456789'
}
