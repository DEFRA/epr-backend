import { describe, expect, it } from 'vitest'
import {
  toRegistrationSummary,
  toSiteLocation
} from './registration-summary.js'

/** @import { Registration } from '#domain/organisations/registration.js' */

const userFixture = {
  fullName: 'Test User',
  email: 'test@example.com',
  phone: '01234567890'
}

/** @type {Registration} */
const registrationFixture = {
  id: 'reg-1',
  accreditation: null,
  applicationContactDetails: userFixture,
  approvedPersons: [],
  formSubmission: { id: 'fs-1', time: new Date('2026-01-01') },
  material: 'plastic',
  orgName: 'Acme Ltd',
  site: {
    address: { line1: 'Unit 1', postcode: 'LS10 1AB' },
    gridReference: 'TQ123456',
    siteCapacity: []
  },
  statusHistory: [{ status: 'approved', updatedAt: '2026-01-01' }],
  submittedToRegulator: 'ea',
  submitterContactDetails: userFixture,
  wasteProcessingType: 'reprocessor',
  registrationNumber: 'R26ER5001180041PL',
  status: 'approved',
  validFrom: '2026-01-01',
  validTo: '2026-12-31'
}

/** @returns {Registration} */
const buildRegistration = (overrides = {}) => ({
  ...registrationFixture,
  ...overrides
})

describe('toRegistrationSummary', () => {
  it('projects what the registration covers and where', () => {
    expect(toRegistrationSummary(buildRegistration())).toEqual({
      id: 'reg-1',
      registrationNumber: 'R26ER5001180041PL',
      status: 'approved',
      material: 'plastic',
      processingType: 'reprocessor',
      site: 'Unit 1'
    })
  })

  it('names the reprocessing type alongside the processing type', () => {
    const summary = toRegistrationSummary(
      buildRegistration({ reprocessingType: 'input' })
    )

    expect(summary.processingType).toBe('reprocessor - input')
  })

  it('carries no site for an exporter', () => {
    const summary = toRegistrationSummary(
      buildRegistration({ wasteProcessingType: 'exporter' })
    )

    expect(summary.site).toBeNull()
    expect(summary.processingType).toBe('exporter')
  })

  it('carries a null site when a stored address has no first line', () => {
    const summary = toRegistrationSummary(
      buildRegistration({
        site: {
          address: { postcode: 'LS10 1AB' },
          gridReference: 'TQ123456',
          siteCapacity: []
        }
      })
    )

    expect(summary.site).toBeNull()
  })

  it('carries a null registration number when the registration has none', () => {
    const { registrationNumber: _neverNumbered, ...withoutNumber } =
      registrationFixture
    /** @type {Registration} */
    const created = { ...withoutNumber, status: 'created' }

    expect(toRegistrationSummary(created).registrationNumber).toBeNull()
  })
})

describe('toSiteLocation', () => {
  it('projects the town and postcode the site sits in', () => {
    expect(
      toSiteLocation(
        buildRegistration({
          site: {
            address: { line1: 'Unit 1', town: 'Leeds', postcode: 'LS10 1AB' },
            gridReference: 'TQ123456',
            siteCapacity: []
          }
        })
      )
    ).toEqual({ town: 'Leeds', postcode: 'LS10 1AB' })
  })

  it('carries no location for an exporter', () => {
    expect(
      toSiteLocation(buildRegistration({ wasteProcessingType: 'exporter' }))
    ).toEqual({ town: null, postcode: null })
  })

  it('carries nulls when a stored address names neither', () => {
    expect(
      toSiteLocation(
        buildRegistration({
          site: {
            address: { line1: 'Unit 1' },
            gridReference: 'TQ123456',
            siteCapacity: []
          }
        })
      )
    ).toEqual({ town: null, postcode: null })
  })
})
