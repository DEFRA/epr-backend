import { formatTonnageMonitoringResults } from '#application/common/material-aggregation.js'
import { TEST_ORGANISATION_NUMBERS } from '#common/helpers/parse-test-organisations.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'

/** @import { Organisation } from '#organisation-read-model/index.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/index.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { OrganisationNumber, RegistrationNumber } from '#domain/organisations/numbers.js' */

/**
 * @typedef {{
 *   organisationNumber: OrganisationNumber
 *   registrationNumber: RegistrationNumber
 *   year: number
 *   monthNumber: number
 *   month: string
 *   type: string
 *   totalTonnage: number
 * }} RegistrationTonnage
 */

/**
 * @param {OrganisationNumber} organisationNumber
 * @param {RegistrationNumber} registrationNumber
 */
const registrationKey = (organisationNumber, registrationNumber) =>
  `${organisationNumber}:${registrationNumber}`

/**
 * Test organisations are left out.
 *
 * @param {Organisation[]} organisations
 * @returns {Map<string, string>}
 */
const materialByRegistration = (organisations) =>
  new Map(
    organisations
      .filter(
        ({ organisationNumber }) =>
          !TEST_ORGANISATION_NUMBERS.has(organisationNumber)
      )
      .flatMap(({ organisationNumber, registrations }) =>
        Object.entries(registrations).map(
          ([registrationNumber, { material }]) => [
            registrationKey(
              organisationNumber,
              toRegistrationNumber(registrationNumber)
            ),
            material
          ]
        )
      )
  )

/**
 * Rows whose registration the read model doesn't serve are left out.
 *
 * @param {RegistrationTonnage[]} registrationTonnages
 * @param {Map<string, string>} materials
 */
const sumByMaterial = (registrationTonnages, materials) => {
  const totals = new Map()

  for (const {
    organisationNumber,
    registrationNumber,
    year,
    monthNumber,
    month,
    type,
    totalTonnage
  } of registrationTonnages) {
    const material = materials.get(
      registrationKey(organisationNumber, registrationNumber)
    )
    if (material === undefined) {
      continue
    }
    const key = `${material}-${year}-${monthNumber}-${type}`
    const existing = totals.get(key)
    if (existing) {
      existing.totalTonnage += totalTonnage
    } else {
      totals.set(key, {
        material,
        year,
        monthNumber,
        month,
        type,
        totalTonnage
      })
    }
  }

  return [...totals.values()]
}

/**
 * @param {(summaryLogIds: string[]) => Promise<RegistrationTonnage[]>} findRegistrationTonnages
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {OrganisationReadRepository} organisationReadRepository
 */
export const aggregateTonnageByMaterial = async (
  findRegistrationTonnages,
  ledgerRepository,
  organisationReadRepository
) => {
  const [latestSubmitted, organisations] = await Promise.all([
    ledgerRepository.findLatestSubmittedSummaryLogPerLedger(),
    organisationReadRepository.findAll()
  ])
  const registrationTonnages = await findRegistrationTonnages(
    latestSubmitted.map((entry) => entry.summaryLogId)
  )

  const { materials, total } = formatTonnageMonitoringResults(
    sumByMaterial(registrationTonnages, materialByRegistration(organisations))
  )

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
