import { toYear } from '#common/helpers/dates/year.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { randomInt, randomUUID } from 'node:crypto'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'

const ACCREDITATION_YEAR = 2026
export const PRN_YEAR = toYear(ACCREDITATION_YEAR)

/** @import { AccreditationSnapshot, OrganisationSnapshot, PackagingRecyclingNote } from '#packaging-recycling-notes/domain/model.js' */

/**
 * What a test may override on a built PRN. The organisation's number may be
 * left out; the builder supplies one.
 *
 * @typedef {Partial<Omit<PackagingRecyclingNote, 'organisation'>> & {
 *   organisation?: Omit<OrganisationSnapshot, 'organisationNumber'> &
 *     Partial<Pick<OrganisationSnapshot, 'organisationNumber'>>
 * }} PrnOverrides
 */

const DEFAULT_CREATOR = { id: 'user-creator', name: 'Creator User' }
const DEFAULT_RAISER = { id: 'user-raiser', name: 'Raiser User' }
const DEFAULT_ISSUER = { id: 'user-issuer', name: 'Issuer User' }
const STATUS_HISTORY_OFFSET_MS = 1000
const TEST_PRN_NUMBER_LENGTH = 5

let lastTestPrnSequence = 0

/**
 * Generates a PRN number for test data, never the same one twice in a test
 * file, so tests sharing a database cannot trip its unique PRN number index.
 * Uses TT prefix (Test/Test) to distinguish from real PRNs ([ENSW][RX]).
 */
export function generateTestPrnNumber() {
  lastTestPrnSequence += 1
  return `TT26${String(lastTestPrnSequence).padStart(TEST_PRN_NUMBER_LENGTH, '0')}`
}
const AWAITING_ACCEPTANCE_HISTORY_STEPS = 3
const CANCELLED_HISTORY_STEPS = 5
const CANCELLED_ISSUED_STEP_OFFSET = 3

/**
 * Builds an accreditation with sensible defaults.
 * @param {Partial<AccreditationSnapshot>} [overrides]
 * @returns {AccreditationSnapshot}
 */
export const buildAccreditationSnapshot = (overrides = {}) => ({
  accreditationNumber: toAccreditationNumber('ACC-2026-001'),
  accreditationYear: PRN_YEAR,
  material: 'plastic',
  submittedToRegulator: 'ea',
  siteAddress: {
    line1: '1 Test Street',
    postcode: 'SW1A 1AA'
  },
  ...overrides
})

/** The organisation number of a PRN fixture that needs no particular one. */
export const TEST_ORGANISATION_NUMBER = toOrganisationNumber('500123')

/** The registration of a PRN fixture that needs no particular one. */
export const TEST_REGISTRATION = {
  registrationNumber: toRegistrationNumber('R26ER5001230456PA')
}

const uniqueNumber = () => randomInt(100_000_000, 1_000_000_000)

const uniqueOrganisationNumber = () =>
  toOrganisationNumber(String(uniqueNumber()))

const uniqueRegistrationNumber = () =>
  toRegistrationNumber(`R26ER${uniqueNumber()}PA`)

/**
 * @typedef {import('../port.js').AccreditationNumbers} AccreditationKeys
 */

/**
 * Builds the numbers of an accreditation and the registration and organisation
 * above it. Unique per call — the Mongo test database is shared across the
 * tests in a file, so no two may share numbers.
 *
 * @param {Partial<AccreditationKeys>} [overrides]
 * @returns {AccreditationKeys}
 */
export const buildAccreditationKeys = (overrides = {}) => {
  const unique = uniqueNumber()
  return {
    organisationNumber: toOrganisationNumber(String(unique)),
    registrationNumber: toRegistrationNumber(`R26ER${unique}PA`),
    accreditationNumber: toAccreditationNumber(`A26ER${unique}PA`),
    ...overrides
  }
}

/**
 * Places a PRN under an accreditation, so that the numbers the PRN carries
 * agree with the accreditation a reader names it by.
 *
 * @param {Partial<import('#domain/organisations/numbers.js').Numbers>} numbers
 * @param {PrnOverrides} [overrides]
 */
export const underAccreditation = (numbers, overrides = {}) => ({
  organisation: {
    name: 'Test Organisation',
    ...(numbers.organisationNumber && {
      organisationNumber: numbers.organisationNumber
    })
  },
  ...(numbers.registrationNumber && {
    registration: { registrationNumber: numbers.registrationNumber }
  }),
  accreditation: buildAccreditationSnapshot({
    ...(numbers.accreditationNumber && {
      accreditationNumber: numbers.accreditationNumber
    })
  }),
  ...overrides
})

/**
 * Builds a valid PRN for testing with sensible defaults.
 * All required fields are populated, with optional overrides.
 *
 * @param {PrnOverrides} overrides
 * @returns {Omit<import('#packaging-recycling-notes/domain/model.js').PackagingRecyclingNote, 'id'>}
 */
export const buildPrn = (overrides = {}) => {
  const now = new Date()
  const {
    status: statusOverrides,
    organisation: organisationOverride,
    ...rest
  } = overrides
  const organisationNumber = uniqueOrganisationNumber()

  return {
    schemaVersion: 2,
    version: 1,
    organisation: organisationOverride
      ? {
          ...organisationOverride,
          organisationNumber:
            organisationOverride.organisationNumber ?? organisationNumber
        }
      : {
          organisationNumber,
          name: 'Test Organisation',
          tradingName: 'Test Trading'
        },
    registration: { registrationNumber: uniqueRegistrationNumber() },
    accreditation: buildAccreditationSnapshot(),
    obligationYear: PRN_YEAR,
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
 * @param {PrnOverrides} overrides
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
 * @param {PrnOverrides} overrides
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
 * @param {PrnOverrides} overrides
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
 * @param {PrnOverrides} overrides
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
 * @param {PrnOverrides} overrides
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
