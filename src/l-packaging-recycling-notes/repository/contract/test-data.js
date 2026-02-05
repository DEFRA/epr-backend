import { randomUUID } from 'node:crypto'
import { PRN_STATUS } from '#l-packaging-recycling-notes/domain/model.js'

const DEFAULT_CREATOR = 'user-creator'

/**
 * Builds a valid PRN for testing with sensible defaults.
 * All required fields are populated, with optional overrides.
 *
 * @param {Partial<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
 * @returns {Omit<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>}
 */
export const buildPrn = (overrides = {}) => {
  const now = new Date()
  const { status: statusOverrides, ...rest } = overrides

  return {
    accreditationYear: 2026,
    issuedByOrganisation: `org-${randomUUID()}`,
    issuedByAccreditation: `acc-${randomUUID()}`,
    issuedToOrganisation: `recipient-${randomUUID()}`,
    tonnage: 100.5,
    material: 'plastic',
    regulator: 'ea',
    nation: 'england',
    wasteProcessingType: 'reprocessing',
    isExport: false,
    status: {
      currentStatus: PRN_STATUS.DRAFT,
      history: [
        {
          status: PRN_STATUS.DRAFT,
          updatedAt: now,
          updatedBy: DEFAULT_CREATOR
        }
      ],
      ...statusOverrides
    },
    createdAt: now,
    createdBy: `user-${randomUUID()}`,
    updatedAt: now,
    ...rest
  }
}

/**
 * Builds a PRN in draft status.
 * @param {Partial<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
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
          updatedBy: DEFAULT_CREATOR
        }
      ],
      ...overrides.status
    }
  })

/**
 * Builds a PRN in awaiting_authorisation status.
 * @param {Partial<import('#l-packaging-recycling-notes/domain/model.js').PackagingRecyclingNote>} overrides
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
          updatedAt: new Date(now.getTime() - 1000),
          updatedBy: DEFAULT_CREATOR
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
