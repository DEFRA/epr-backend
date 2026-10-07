import { ObjectId } from 'mongodb'

import {
  buildAccreditation,
  buildRegistration
} from '#repositories/organisations/contract/test-data.js'

export const REPROCESSOR_NUMBER = 'R26ER5001180041PL'
export const EXPORTER_NUMBER = 'R26EX5001180042PL'
export const ACCREDITATION_NUMBER = 'A26ER5001180114PL'
export const EXPORTER_ACCREDITATION_NUMBER = 'A26EX5001180115PL'

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

/** @import { StatusHistoryEntryOf } from '#domain/organisations/accreditation.js' */
/** @import { AccreditationStatus } from '#domain/organisations/model.js' */
/** @import { Organisation } from '#organisation-read-model/domain/model.js' */
/** @import { OrganisationReadRepository } from '../port.js' */

/**
 * @param {OrganisationReadRepository} repository
 * @param {number} organisationNumber
 * @returns {Promise<Organisation>}
 */
export const findOrganisation = async (repository, organisationNumber) => {
  const organisation =
    await repository.findByOrganisationNumber(organisationNumber)
  expect(organisation).not.toBeNull()
  return /** @type {Organisation} */ (organisation)
}

/**
 * @param {AccreditationStatus} status
 * @returns {StatusHistoryEntryOf<AccreditationStatus>[]}
 */
export const granted = (status) => [
  { status: 'created', updatedAt: '2026-01-01T09:00:00.000Z' },
  { status, updatedAt: '2026-02-01T09:00:00.000Z' }
]

export const grantedTimeline = (status) => ({
  '2026-01-01': { status: 'created' },
  '2026-02-01': { status }
})

export const accreditation = (overrides = {}) =>
  buildAccreditation({
    accreditationNumber: ACCREDITATION_NUMBER,
    validFrom: '2026-07-01',
    validTo: '2026-12-31',
    statusHistory: granted('approved'),
    ...overrides
  })

export const exporterAccreditation = (overrides = {}) =>
  accreditation({
    wasteProcessingType: 'exporter',
    accreditationNumber: EXPORTER_ACCREDITATION_NUMBER,
    ...overrides
  })

export const reprocessor = (overrides = {}) =>
  buildRegistration({
    registrationNumber: REPROCESSOR_NUMBER,
    reprocessingType: 'input',
    validFrom: '2026-02-01',
    statusHistory: granted('approved'),
    ...overrides
  })

export const exporter = (overrides = {}) =>
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

/**
 * @param {object} address
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
  coordinates: '52.5200,13.4050'
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

export const yoda = {
  email: 'yoda@starwars.com',
  fullName: 'Yoda',
  phone: '1234567890'
}
