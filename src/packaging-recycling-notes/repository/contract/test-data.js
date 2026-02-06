import { randomUUID } from 'node:crypto'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const DEFAULT_CREATOR = { id: 'user-creator', name: 'Creator User' }
const STATUS_HISTORY_OFFSET_MS = 1000

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
    schemaVersion: 1,
    organisationId: `org-${randomUUID()}`,
    accreditationId: `acc-${randomUUID()}`,
    issuedToOrganisation: {
      id: `recipient-${randomUUID()}`,
      name: 'Recipient Org',
      tradingName: 'Recipient Trading'
    },
    tonnage: 100,
    material: 'plastic',
    isExport: false,
    isDecemberWaste: false,
    accreditationYear: 2026,
    issuedAt: null,
    issuedBy: null,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      history: [
        {
          status: PRN_STATUS.DRAFT,
          updatedAt: now,
          updatedBy: DEFAULT_CREATOR.id
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
export const buildDraftPrn = (overrides = {}) =>
  buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      history: [
        {
          status: PRN_STATUS.DRAFT,
          updatedAt: new Date(),
          updatedBy: DEFAULT_CREATOR.id
        }
      ],
      ...overrides.status
    }
  })

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
      history: [
        {
          status: PRN_STATUS.DRAFT,
          updatedAt: new Date(now.getTime() - STATUS_HISTORY_OFFSET_MS),
          updatedBy: DEFAULT_CREATOR.id
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          updatedAt: now,
          updatedBy: 'user-raiser'
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
  return buildPrn({
    ...overrides,
    status: {
      currentStatus: PRN_STATUS.DELETED,
      history: [
        {
          status: PRN_STATUS.DRAFT,
          updatedAt: new Date(now.getTime() - 2 * STATUS_HISTORY_OFFSET_MS),
          updatedBy: DEFAULT_CREATOR.id
        },
        {
          status: PRN_STATUS.DELETED,
          updatedAt: now,
          updatedBy: 'user-deleter'
        }
      ],
      ...overrides.status
    }
  })
}
