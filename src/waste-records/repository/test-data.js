import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { PROCESSING_TYPES } from '#domain/summary-logs/meta-fields.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import {
  toAccreditationNumber,
  toOrganisationNumber,
  toRegistrationNumber
} from '#domain/organisations/numbers.js'
import { generateOrgId } from '#repositories/form-submissions/contract/test-data.js'

/** @import { RegistrationOrAccreditationId } from '#waste-balances/repository/ledger-schema.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * Build a summary-log row state document (insert shape — no `id`).
 * Defaults to an INCLUDED received-waste row in one submission's membership.
 * @param {object} [overrides]
 */
export const buildSummaryLogRowState = (overrides = {}) => ({
  ...withNumbers({
    organisationId: 'org-1',
    registrationId: 'reg-1',
    accreditationId: 'acc-1',
    ...overrides
  }),
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  rowId: 'row-1',
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { supplierName: 'Acme', tonnage: 10 },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  summaryLogIds: ['log-1'],
  ...overrides
})

/**
 * Build a per-row entry as produced by the 1.1 classification list — the
 * shape `upsertSummaryLogRowStates` consumes (no ledger-identity fields, no membership).
 * @param {object} [overrides]
 */
export const buildSummaryLogRowStateEntry = (overrides = {}) => ({
  rowId: 'row-1',
  wasteRecordType: WASTE_RECORD_TYPE.RECEIVED,
  processingType: PROCESSING_TYPES.REPROCESSOR_INPUT,
  data: { supplierName: 'Acme', tonnage: 10 },
  classification: {
    outcome: ROW_OUTCOME.INCLUDED,
    reasons: [],
    transactionAmount: 10
  },
  ...overrides
})

export const DEFAULT_LEDGER_ID = Object.freeze({
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
})

/** @type {Map<string, number>} */
const organisationNumbers = new Map()

/** @param {string} organisationId */
const organisationNumberOf = (organisationId) => {
  if (!organisationNumbers.has(organisationId)) {
    organisationNumbers.set(organisationId, generateOrgId())
  }
  return toOrganisationNumber(String(organisationNumbers.get(organisationId)))
}

/**
 * The organisation and registration numbers `withNumbers` gives a ledger
 * identity, as the arguments a registration-scoped read takes.
 *
 * @param {Pick<RegistrationOrAccreditationId, 'organisationId' | 'registrationId'>} ledgerId
 * @returns {[OrganisationNumber, RegistrationNumber]}
 */
export const registrationNumbersOf = ({ organisationId, registrationId }) => [
  organisationNumberOf(organisationId),
  toRegistrationNumber(`REG-${registrationId}`)
]

/**
 * The ledger identity with the numbers a submission stores beside its ids.
 *
 * @param {RegistrationOrAccreditationId} ledgerId
 * @returns {import('#waste-balances/repository/ledger-schema.js').NumberedLedgerId}
 */
export const withNumbers = (ledgerId) => {
  const [organisationNumber, registrationNumber] =
    registrationNumbersOf(ledgerId)
  return {
    ...ledgerId,
    organisationNumber,
    registrationNumber,
    accreditationNumber:
      ledgerId.accreditationId === null
        ? null
        : toAccreditationNumber(`ACC-${ledgerId.accreditationId}`)
  }
}

/**
 * The ledger identity with the numbers of the records its ids name among
 * `organisations`, falling back to `withNumbers` for a record they do not hold.
 *
 * @param {Array<{ id: string, orgId: number, registrations: Array<{ id: string, registrationNumber?: string | null }>, accreditations: Array<{ id: string, accreditationNumber?: string | null }> }>} organisations
 * @param {RegistrationOrAccreditationId} ledgerId
 * @returns {import('#waste-balances/repository/ledger-schema.js').NumberedLedgerId}
 */
export const withNumbersHeldBy = (organisations, ledgerId) => {
  const derived = withNumbers(ledgerId)
  const org = organisations.find(({ id }) => id === ledgerId.organisationId)
  const registration = org?.registrations.find(
    ({ id }) => id === ledgerId.registrationId
  )
  const accreditation = org?.accreditations.find(
    ({ id }) => id === ledgerId.accreditationId
  )
  return {
    ...derived,
    ...(org && { organisationNumber: toOrganisationNumber(String(org.orgId)) }),
    ...(registration?.registrationNumber && {
      registrationNumber: toRegistrationNumber(registration.registrationNumber)
    }),
    ...(accreditation?.accreditationNumber && {
      accreditationNumber: toAccreditationNumber(
        accreditation.accreditationNumber
      )
    })
  }
}
