import { describe, it, expect } from 'vitest'

import { mapToExternalPrn } from './external-prn-mapper.js'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const draftDate = new Date('2026-01-10T10:00:00Z')
const authorisedDate = new Date('2026-01-12T10:00:00Z')
const issuedDate = new Date('2026-01-15T10:00:00Z')
const acceptedDate = new Date('2026-01-20T10:00:00Z')
const rejectedDate = new Date('2026-01-22T10:00:00Z')
const cancelledDate = new Date('2026-01-25T10:00:00Z')

const creator = { id: 'user-123', name: 'Test User' }
const issuer = { id: 'user-issuer', name: 'Issuer User', position: 'Manager' }
const producer = { id: 'user-producer', name: 'Producer User' }

const buildAwaitingAcceptancePrn = (overrides = {}) => ({
  id: '507f1f77bcf86cd799439011',
  schemaVersion: 2,
  prnNumber: 'ER2600001',
  organisation: {
    id: 'org-123',
    name: 'Reprocessor Ltd',
    tradingName: 'Reprocessor Trading'
  },
  registrationId: 'reg-456',
  accreditation: {
    id: 'acc-789',
    accreditationNumber: 'A26ER1075628626-PL',
    accreditationYear: 2026,
    material: 'plastic',
    submittedToRegulator: 'ea'
  },
  issuedToOrganisation: {
    id: 'producer-org-789',
    name: 'Producer Corp',
    tradingName: 'Producer Trading'
  },
  tonnage: 126,
  isExport: false,
  isDecemberWaste: true,
  notes: 'T2E Reference 9201234',
  status: {
    currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
    created: { at: authorisedDate, by: creator },
    issued: { at: issuedDate, by: issuer },
    history: [
      { status: PRN_STATUS.DRAFT, at: draftDate, by: creator },
      {
        status: PRN_STATUS.AWAITING_AUTHORISATION,
        at: authorisedDate,
        by: creator
      },
      { status: PRN_STATUS.AWAITING_ACCEPTANCE, at: issuedDate, by: issuer }
    ]
  },
  createdAt: draftDate,
  createdBy: creator,
  updatedAt: issuedDate,
  updatedBy: issuer,
  ...overrides
})

describe('mapToExternalPrn', () => {
  it('maps all required fields for an awaiting_acceptance PRN', () => {
    const prn = buildAwaitingAcceptancePrn()

    const result = mapToExternalPrn(prn)

    expect(result).toEqual({
      id: '507f1f77bcf86cd799439011',
      prnNumber: 'ER2600001',
      status: {
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        authorisedBy: { fullName: 'Issuer User', jobTitle: 'Manager' },
        authorisedAt: issuedDate
      },
      issuedByOrganisation: {
        id: 'org-123',
        name: 'Reprocessor Ltd',
        tradingName: 'Reprocessor Trading'
      },
      issuedToOrganisation: {
        id: 'producer-org-789',
        name: 'Producer Corp',
        tradingName: 'Producer Trading'
      },
      accreditation: {
        id: 'acc-789',
        accreditationNumber: 'A26ER1075628626-PL',
        accreditationYear: 2026,
        material: 'plastic',
        submittedToRegulator: 'ea'
      },
      isDecemberWaste: true,
      isExport: false,
      tonnageValue: 126,
      issuerNotes: 'T2E Reference 9201234'
    })
  })

  it('maps acceptedAt from the accepted status slot', () => {
    const prn = buildAwaitingAcceptancePrn({
      status: {
        currentStatus: PRN_STATUS.ACCEPTED,
        created: { at: authorisedDate, by: creator },
        issued: { at: issuedDate, by: issuer },
        accepted: { at: acceptedDate, by: producer },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.status.acceptedAt).toEqual(acceptedDate)
  })

  it('maps rejectedAt from the rejected status slot', () => {
    const prn = buildAwaitingAcceptancePrn({
      status: {
        currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
        created: { at: authorisedDate, by: creator },
        issued: { at: issuedDate, by: issuer },
        rejected: { at: rejectedDate, by: producer },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.status.rejectedAt).toEqual(rejectedDate)
  })

  it('maps cancelledAt from the cancelled status slot', () => {
    const prn = buildAwaitingAcceptancePrn({
      status: {
        currentStatus: PRN_STATUS.CANCELLED,
        created: { at: authorisedDate, by: creator },
        issued: { at: issuedDate, by: issuer },
        rejected: { at: rejectedDate, by: producer },
        cancelled: { at: cancelledDate, by: issuer },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.status.cancelledAt).toEqual(cancelledDate)
  })

  it('omits authorisedBy and authorisedAt when issued slot is absent', () => {
    const prn = buildAwaitingAcceptancePrn({
      status: {
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        created: { at: authorisedDate, by: creator },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.status).toEqual({
      currentStatus: PRN_STATUS.AWAITING_AUTHORISATION
    })
  })

  it('omits jobTitle when actor has no position', () => {
    const issuerWithoutPosition = { id: 'user-issuer', name: 'Issuer User' }
    const prn = buildAwaitingAcceptancePrn({
      status: {
        currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
        created: { at: authorisedDate, by: creator },
        issued: { at: issuedDate, by: issuerWithoutPosition },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.status.authorisedBy).toEqual({
      fullName: 'Issuer User'
    })
  })

  it('omits tradingName when not present on organisations', () => {
    const prn = buildAwaitingAcceptancePrn({
      organisation: { id: 'org-123', name: 'Reprocessor Ltd' },
      issuedToOrganisation: { id: 'producer-org-789', name: 'Producer Corp' }
    })

    const result = mapToExternalPrn(prn)

    expect(result.issuedByOrganisation).toEqual({
      id: 'org-123',
      name: 'Reprocessor Ltd'
    })
    expect(result.issuedToOrganisation).toEqual({
      id: 'producer-org-789',
      name: 'Producer Corp'
    })
  })

  it('omits prnNumber when absent', () => {
    const prn = buildAwaitingAcceptancePrn({
      prnNumber: undefined,
      status: {
        currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
        created: { at: authorisedDate, by: creator },
        history: []
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.prnNumber).toBeUndefined()
  })

  it('omits issuerNotes when notes are absent', () => {
    const prn = buildAwaitingAcceptancePrn({ notes: undefined })

    const result = mapToExternalPrn(prn)

    expect(result.issuerNotes).toBeUndefined()
  })

  it('includes glassRecyclingProcess when present on accreditation', () => {
    const prn = buildAwaitingAcceptancePrn({
      accreditation: {
        id: 'acc-789',
        accreditationNumber: 'A26ER1075628626-GL',
        accreditationYear: 2026,
        material: 'glass',
        submittedToRegulator: 'ea',
        glassRecyclingProcess: 'glass_re_melt'
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.accreditation.glassRecyclingProcess).toBe('glass_re_melt')
  })

  it('includes siteAddress when present on accreditation', () => {
    const siteAddress = {
      line1: '123 Recycling Way',
      line2: 'Industrial Estate',
      town: 'Manchester',
      county: 'Greater Manchester',
      postcode: 'M1 2AB',
      country: 'United Kingdom'
    }
    const prn = buildAwaitingAcceptancePrn({
      accreditation: {
        id: 'acc-789',
        accreditationNumber: 'A26ER1075628626-PL',
        accreditationYear: 2026,
        material: 'plastic',
        submittedToRegulator: 'ea',
        siteAddress
      }
    })

    const result = mapToExternalPrn(prn)

    expect(result.accreditation.siteAddress).toEqual(siteAddress)
  })

  it('maps an export PRN correctly', () => {
    const prn = buildAwaitingAcceptancePrn({ isExport: true })

    const result = mapToExternalPrn(prn)

    expect(result.isExport).toBe(true)
  })
})
