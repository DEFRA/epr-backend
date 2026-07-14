import { TEST_ORGANISATION_IDS } from '#common/helpers/parse-test-organisations.js'
import { add, toNumber } from '#common/helpers/decimal-utils.js'
import { resolveAccreditation } from '#domain/organisations/registration-utils.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration, RegistrationApproved} from '#domain/organisations/registration.js' */
/** @import {AccreditationApproved} from '#domain/organisations/accreditation.js' */
/** @import {OrganisationsRepository} from '#repositories/organisations/port.js' */
/** @import {WasteBalanceLedgerRepository} from '../repository/ledger-port.js' */

const TEST_ORGANISATIONS = new Set(TEST_ORGANISATION_IDS)

/**
 * @typedef {Object} WasteBalanceReportRow
 * @property {string} orgId - The organisation's external reference (not its
 *   internal id), as a string.
 * @property {string} registrationNumber
 * @property {string} accreditationNumber
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {number} amount
 * @property {number} availableAmount
 */

/**
 * @typedef {Object} WasteBalanceReportTotal
 * @property {string} material
 * @property {string} wasteProcessingType
 * @property {number} amount
 * @property {number} availableAmount
 */

/**
 * @typedef {Object} WasteBalanceReport
 * @property {WasteBalanceReportTotal[]} totals
 * @property {WasteBalanceReportRow[]} accreditations
 */

/**
 * @typedef {Object} WasteBalanceReportDeps
 * @property {Pick<OrganisationsRepository, 'findAll'>} organisationsRepository
 * @property {Pick<WasteBalanceLedgerRepository, 'findLatestInLedgerBefore'>} ledgerRepository
 */

/**
 * One report row: the accreditation's balance as it stood at the cutoff —
 * the closing balance of the last ledger event created strictly before it.
 * An accreditation with no ledger history before the cutoff has a zero
 * balance.
 *
 * @param {WasteBalanceReportDeps['ledgerRepository']} ledgerRepository
 * @param {Organisation} org
 * @param {Registration} registration
 * @param {AccreditationApproved} accreditation
 * @param {Date} cutoff
 * @returns {Promise<WasteBalanceReportRow>}
 */
const buildReportRow = async (
  ledgerRepository,
  org,
  registration,
  accreditation,
  cutoff
) => {
  const event = await ledgerRepository.findLatestInLedgerBefore(
    {
      organisationId: org.id,
      registrationId: registration.id,
      accreditationId: accreditation.id
    },
    cutoff
  )

  const balance = event
    ? event.closingBalance
    : { amount: 0, availableAmount: 0 }

  return {
    orgId: String(org.orgId),
    // A live accreditation implies a registration that has been approved and
    // so carries a registrationNumber (validateApprovals enforces the link at
    // write time) — same cast precedent as getReportableRegistrations.
    registrationNumber: /** @type {RegistrationApproved} */ (registration)
      .registrationNumber,
    accreditationNumber: accreditation.accreditationNumber,
    material: accreditation.material,
    wasteProcessingType: accreditation.wasteProcessingType,
    amount: balance.amount,
    availableAmount: balance.availableAmount
  }
}

/**
 * Per-material totals across the rows: one entry per (material,
 * wasteProcessingType) combination that has at least one accredited
 * registration, summing balance and available balance with exact decimal
 * arithmetic. A combination whose accreditations all hold zero balances
 * still appears, summing to zero.
 *
 * @param {WasteBalanceReportRow[]} rows
 * @returns {WasteBalanceReportTotal[]}
 */
const totalBalancesPerMaterial = (rows) => {
  /** @type {Map<string, WasteBalanceReportTotal>} */
  const totals = new Map()

  for (const row of rows) {
    const key = `${row.material}|${row.wasteProcessingType}`
    const total = totals.get(key) ?? {
      material: row.material,
      wasteProcessingType: row.wasteProcessingType,
      amount: 0,
      availableAmount: 0
    }
    total.amount = toNumber(add(total.amount, row.amount))
    total.availableAmount = toNumber(
      add(total.availableAmount, row.availableAmount)
    )
    totals.set(key, total)
  }

  return [...totals.values()]
}

/**
 * The waste balance report as at a cutoff instant: every live (approved or
 * suspended) accreditation across all non-test organisations with the
 * balance from its last ledger event before the cutoff, plus per-material
 * totals across reprocessors and across exporters. Registered-only
 * registrations and accreditations in created/rejected/cancelled states are
 * out of scope — `resolveAccreditation` only yields live accreditations.
 *
 * @param {WasteBalanceReportDeps} deps
 * @param {Date} cutoff
 * @returns {Promise<WasteBalanceReport>}
 */
export const generateWasteBalanceReport = async (
  { organisationsRepository, ledgerRepository },
  cutoff
) => {
  const organisations = await organisationsRepository.findAll()

  /** @type {WasteBalanceReportRow[]} */
  const accreditations = []

  for (const org of organisations) {
    if (TEST_ORGANISATIONS.has(org.orgId)) {
      continue
    }

    for (const registration of org.registrations) {
      const accreditation = /** @type {AccreditationApproved | null} */ (
        resolveAccreditation(registration, org)
      )
      if (!accreditation) {
        continue
      }

      accreditations.push(
        await buildReportRow(
          ledgerRepository,
          org,
          registration,
          accreditation,
          cutoff
        )
      )
    }
  }

  return { totals: totalBalancesPerMaterial(accreditations), accreditations }
}
