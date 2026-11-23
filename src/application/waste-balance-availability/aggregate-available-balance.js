import { formatMaterialResults } from '#application/common/material-aggregation.js'
import { add } from '#common/helpers/decimal-utils.js'
import { ledgerKey } from '#waste-balances/repository/ledger-schema.js'
import { indexByLedger } from '#waste-balances/application/read-model-accreditations.js'

/** @import { DecimalValue } from '#common/helpers/decimal-utils.js' */
/** @import { OrganisationReadRepository } from '#organisation-read-model/index.js' */
/** @import { LedgerAccreditation } from '#waste-balances/application/read-model-accreditations.js' */
/** @import { WasteBalanceLedgerRepository } from '#waste-balances/repository/ledger-port.js' */
/** @import { Year } from '#common/helpers/dates/year.js' */

/**
 * The available amount at each accreditation's latest ledger event, summed by
 * material. An accreditation with an empty ledger contributes nothing.
 *
 * @param {OrganisationReadRepository} organisationReadRepository
 * @param {WasteBalanceLedgerRepository} ledgerRepository
 * @param {Year} year
 */
export const aggregateAvailableBalance = async (
  organisationReadRepository,
  ledgerRepository,
  year
) => {
  const accreditations = indexByLedger(
    await organisationReadRepository.findAll({ year })
  )

  const latestEvents = await ledgerRepository.findLatestInLedgers(
    [...accreditations.values()].map(
      ({ organisation, registrationNumber, accreditation }) => ({
        organisationNumber: organisation.organisationNumber,
        registrationNumber,
        accreditationNumber: accreditation.accreditationNumber,
        year
      })
    )
  )

  /** @type {Map<string, DecimalValue>} */
  const totals = new Map()
  for (const event of latestEvents) {
    const { registration } = /** @type {LedgerAccreditation} */ (
      accreditations.get(ledgerKey(event))
    )
    totals.set(
      registration.material,
      add(
        totals.get(registration.material) ?? 0,
        event.closingBalance.availableAmount
      )
    )
  }

  const { materials, total } = formatMaterialResults(
    [...totals].map(([material, availableAmount]) => ({
      material,
      availableAmount
    })),
    'availableAmount'
  )

  return {
    generatedAt: new Date().toISOString(),
    materials,
    total
  }
}
