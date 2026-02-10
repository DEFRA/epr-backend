import { randomUUID } from 'node:crypto'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const DEFAULT_CREATOR = { id: 'user-creator', name: 'Creator User' }
const STATUS_HISTORY_OFFSET_MS = 1000
const PRN_SUFFIX_DIGITS = 5
const AWAITING_ACCEPTANCE_HISTORY_STEPS = 3

/**
 * Builds a valid PRN for testing with sensible defaults.
 * All required fields are populated, with optional overrides.
 *
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 * @returns {Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>}
 */
export const buildPrn = (overrides = {}) => {
  const now = new Date()
  const { status: statusOverrides, ...rest } = overrides

  return {
    schemaVersion: 2,
    organisation: {
      id: `org-${randomUUID()}`,
      name: 'Test Organisation',
      tradingName: 'Test Trading'
    },
    registrationId: `reg-${randomUUID()}`,
    accreditation: {
      id: `acc-${randomUUID()}`,
      accreditationNumber: `ACC-${Date.now()}`,
      accreditationYear: 2026,
      material: 'plastic',
      submittedToRegulator: 'ea',
      siteAddress: {
        line1: '1 Test Street',
        postcode: 'SW1A 1AA'
      }
    },
    issuedToOrganisation: {
      id: `recipient-${randomUUID()}`,
      name: 'Recipient Org',
      tradingName: 'Recipient Trading'
    },
    tonnage: 100,
    isExport: false,
    isDecemberWaste: false,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      created: { at: now, by: DEFAULT_CREATOR },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: now,
          by: DEFAULT_CREATOR
        }
      ],
      ...statusOverrides
    },
    createdAt: now,
    createdBy: DEFAULT_CREATOR,
    updatedAt: now,
    updatedBy: null,
    ...rest
  }
}

/**
 * Builds a PRN in draft status.
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 */
export const buildDraftPrn = (overrides = {}) => {
  const now = new Date()
  return buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      created: { at: now, by: DEFAULT_CREATOR },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: now,
          by: DEFAULT_CREATOR
        }
      ],
      ...overrides.status
    }
  })
}

/**
 * Builds a PRN in awaiting_authorisation status.
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 */
export const buildAwaitingAuthorisationPrn = (overrides = {}) => {
  const now = new Date()
  return buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
      created: {
        at: new Date(now.getTime() - STATUS_HISTORY_OFFSET_MS),
        by: DEFAULT_CREATOR
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date(now.getTime() - STATUS_HISTORY_OFFSET_MS),
          by: DEFAULT_CREATOR
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: now,
          by: { id: 'user-raiser', name: 'Raiser User' }
        }
      ],
      ...overrides.status
    }
  })
}

/**
 * Builds a PRN in awaiting_acceptance status (issued, with PRN number).
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 */
export const buildAwaitingAcceptancePrn = (overrides = {}) => {
  const now = new Date()
  const createdAt = new Date(
    now.getTime() - AWAITING_ACCEPTANCE_HISTORY_STEPS * STATUS_HISTORY_OFFSET_MS
  )
  return buildPrn({
    prnNumber: `ER26${Date.now().toString().slice(-PRN_SUFFIX_DIGITS)}`,
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      created: { at: createdAt, by: DEFAULT_CREATOR },
      issued: {
        at: now,
        by: { id: 'user-issuer', name: 'Issuer User', position: 'Manager' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: createdAt,
          by: DEFAULT_CREATOR
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS),
          by: { id: 'user-raiser', name: 'Raiser User' }
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: now,
          by: { id: 'user-issuer', name: 'Issuer User' }
        }
      ],
      ...overrides.status
    }
  })
}

/**
 * Builds a PRN in deleted status.
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 */
export const buildDeletedPrn = (overrides = {}) => {
  const now = new Date()
  const createdAt = new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS)
  return buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.DELETED,
      created: { at: createdAt, by: DEFAULT_CREATOR },
      deleted: {
        at: now,
        by: { id: 'user-deleter', name: 'Deleter User' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: createdAt,
          by: DEFAULT_CREATOR
        },
        {
          status: PRN_STATUS.DELETED,
          at: now,
          by: { id: 'user-deleter', name: 'Deleter User' }
        }
      ],
      ...overrides.status
    }
  })
}
