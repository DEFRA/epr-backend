import { resolveAccreditation } from '#domain/organisations/registration-utils.js'
import { buildOverseasSitesContext } from '#waste-records-export/domain/overseas-sites-context.js'

import { reconcilePartition } from './reconcile-partition.js'
import { summariseCensus } from './census.js'

/**
 * Reconcile the waste record state collection against the legacy waste-records
 * read across the whole estate. Walks every registration of every organisation,
 * reconciles each partition, and rolls the results up into a census. Read-only.
 *
 * The waste record state view is resolved per partition through
 * `wasteRecordStateSource`, not shared as one repository across the estate.
 * Following the backfill flag, that source is either a constant persisted
 * repository (flag on) or a fresh in-memory store reconstructed for just that
 * partition and discarded after it reconciles (flag off) — so the dry run never
 * holds the whole estate in memory at once.
 *
 * @param {Object} repositories
 * @param {Pick<import('#repositories/organisations/port.js').OrganisationsRepository, 'findAll'>} repositories.organisationsRepository
 * @param {import('#waste-balances/repository/stream-port.js').WasteBalanceStreamRepository} repositories.streamRepository
 * @param {(context: { organisation: import('#domain/organisations/model.js').Organisation, registration: import('#domain/organisations/registration.js').Registration }) => Promise<import('#waste-records/repository/port.js').RowStateRepository>} repositories.wasteRecordStateSource
 * @param {Pick<import('#repositories/waste-records/port.js').WasteRecordsRepository, 'findByRegistration'>} repositories.wasteRecordsRepository
 * @param {Pick<import('#overseas-sites/repository/port.js').OverseasSitesRepository, 'findAll'>} repositories.overseasSitesRepository
 */
export const runReconciliation = async ({
  organisationsRepository,
  streamRepository,
  wasteRecordStateSource,
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
      const wasteRecordStateRepository = await wasteRecordStateSource({
        organisation,
        registration
      })
      reconciliations.push(
        await reconcilePartition({
          streamRepository,
          wasteRecordStateRepository,
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
