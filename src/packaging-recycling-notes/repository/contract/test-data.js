import { randomInt, randomUUID } from 'node:crypto'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const DEFAULT_CREATOR = { id: 'user-creator', name: 'Creator User' }
const DEFAULT_RAISER = { id: 'user-raiser', name: 'Raiser User' }
const DEFAULT_ISSUER = { id: 'user-issuer', name: 'Issuer User' }
const STATUS_HISTORY_OFFSET_MS = 1000
const TEST_PRN_RANDOM_RANGE = 100000
const TEST_PRN_NUMBER_LENGTH = 5

/**
 * Generates a PRN number for test data.
 * Uses TT prefix (Test/Test) to distinguish from real PRNs ([ENSW][RX]).
 */
function generateTestPrnNumber() {
  return `TT26${String(randomInt(TEST_PRN_RANDOM_RANGE)).padStart(TEST_PRN_NUMBER_LENGTH, '0')}`
}
const AWAITING_ACCEPTANCE_HISTORY_STEPS = 3
const CANCELLED_HISTORY_STEPS = 5
const CANCELLED_ISSUED_STEP_OFFSET = 3

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
      currentStatusAt: now,
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
      currentStatusAt: now,
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
      currentStatusAt: now,
      created: {
        at: now,
        by: DEFAULT_RAISER
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
          by: DEFAULT_RAISER
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
  const draftAt = new Date(
    now.getTime() - AWAITING_ACCEPTANCE_HISTORY_STEPS * STATUS_HISTORY_OFFSET_MS
  )
  const authorisedAt = new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS)
  return buildPrn({
    prnNumber: generateTestPrnNumber(),
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      currentStatusAt: now,
      created: {
        at: authorisedAt,
        by: DEFAULT_RAISER
      },
      issued: {
        at: now,
        by: { ...DEFAULT_ISSUER, position: 'Manager' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: draftAt,
          by: DEFAULT_CREATOR
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: authorisedAt,
          by: DEFAULT_RAISER
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: now,
          by: DEFAULT_ISSUER
        }
      ],
      ...overrides.status
    }
  })
}

/**
 * Builds a PRN in cancelled status (full lifecycle: issued → rejected by RPD → cancelled).
 * @param {Partial<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 */
export const buildCancelledPrn = (overrides = {}) => {
  const now = new Date()
  const draftAt = new Date(
    now.getTime() - CANCELLED_HISTORY_STEPS * STATUS_HISTORY_OFFSET_MS
  )
  const authorisedAt = new Date(now.getTime() - 4 * STATUS_HISTORY_OFFSET_MS)
  const issuedAt = new Date(
    now.getTime() - CANCELLED_ISSUED_STEP_OFFSET * STATUS_HISTORY_OFFSET_MS
  )
  const rejectedAt = new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS)
  const cancelledAt = new Date(now.getTime() - STATUS_HISTORY_OFFSET_MS)
  return buildPrn({
    prnNumber: generateTestPrnNumber(),
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.CANCELLED,
      currentStatusAt: cancelledAt,
      created: { at: authorisedAt, by: DEFAULT_RAISER },
      issued: {
        at: issuedAt,
        by: { ...DEFAULT_ISSUER, position: 'Manager' }
      },
      rejected: { at: rejectedAt, by: { id: 'rpd', name: 'RPD' } },
      cancelled: {
        at: cancelledAt,
        by: { id: 'user-canceller', name: 'Canceller User' }
      },
      history: [
        { status: PRN_STATUS.DRAFT, at: draftAt, by: DEFAULT_CREATOR },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: authorisedAt,
          by: DEFAULT_RAISER
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: issuedAt,
          by: DEFAULT_ISSUER
        },
        {
          status: PRN_STATUS.AWAITING_CANCELLATION,
          at: rejectedAt,
          by: { id: 'rpd', name: 'RPD' }
        },
        {
          status: PRN_STATUS.CANCELLED,
          at: cancelledAt,
          by: { id: 'user-canceller', name: 'Canceller User' }
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
  const draftAt = new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS)
  const authorisedAt = new Date(now.getTime() - STATUS_HISTORY_OFFSET_MS)
  return buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.DELETED,
      currentStatusAt: now,
      created: {
        at: authorisedAt,
        by: DEFAULT_RAISER
      },
      deleted: {
        at: now,
        by: { id: 'user-deleter', name: 'Deleter User' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: draftAt,
          by: DEFAULT_CREATOR
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: authorisedAt,
          by: DEFAULT_RAISER
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
