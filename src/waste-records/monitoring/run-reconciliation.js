import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'

import { reconcilePartition } from './reconcile-partition.js'
import { summariseCensus } from './census.js'

/**
 * Reconcile the committed row-state collection against the legacy waste-records
 * read across the whole estate. Walks every registration of every organisation,
 * reconciles each partition, and rolls the results up into a census. Read-only.
 *
 * @param {Object} repositories
 * @param {Pick<import('#repositories/organisations/port.js').OrganisationsRepository, 'findAll'>} repositories.organisationsRepository
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} repositories.streamRepository
 * @param {import('#waste-records/repository/port.js').RowStateRepository} repositories.rowStateRepository
 * @param {Pick<import('#repositories/waste-records/port.js').WasteRecordsRepository, 'findByRegistration'>} repositories.wasteRecordsRepository
 * @param {Pick<import('#overseas-sites/repository/port.js').OverseasSitesRepository, 'findAll'>} repositories.overseasSitesRepository
 */
export const runReconciliation = async ({
  organisationsRepository,
  streamRepository,
  rowStateRepository,
  wasteRecordsRepository,
  overseasSitesRepository
}) => {
  const [organisations, allSites] = await Promise.all([
    organisationsRepository.findAll(),
    overseasSitesRepository.findAll()
  ])
  const sitesById = new Map(allSites.map((site) => [site.id, site]))

  const reconciliations = []
  for (const organisation of organisations) {
    for (const registration of organisation.registrations ?? []) {
      const accreditation = resolveAccreditation(registration, organisation)
      reconciliations.push(
        await reconcilePartition({
          streamRepository,
          rowStateRepository,
          wasteRecordsRepository,
          organisationId: organisation.id,
          registrationId: registration.id,
          accreditationId: accreditation?.id ?? null,
          accreditation,
          overseasSites: buildOverseasSitesContext(registration, sitesById)
        })
      )
    }
  }

  return { reconciliations, census: summariseCensus(reconciliations) }
}
