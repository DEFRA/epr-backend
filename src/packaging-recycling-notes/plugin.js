import { portAdapter } from '#plugins/port-adapter.js'
import { createPackagingRecyclingNotesRepository } from './repository/mongodb.js'
import { packagingRecyclingNotesAccept } from './routes/accept.js'
import { adminPackagingRecyclingNotesCancel } from './routes/admin-cancel.js'
import { adminPackagingRecyclingNotesList } from './routes/admin-list.js'
import {
  prnCancelByNaturalKey,
  prnRoutesByNaturalKey
} from './routes/by-natural-key.js'
import { packagingRecyclingNotesList } from './routes/list.js'
import { getPrnTonnage } from './routes/prn-tonnage/get.js'
import { packagingRecyclingNotesReject } from './routes/reject.js'

export { prnEventsPlugin } from './application/prn-events.plugin.js'
export { reconcileStalePrnProjections } from './application/reconcile-stale-prn-projections.js'
export { createDriftQuery } from './repository/drift-query.mongodb.js'
export {
  COLLECTION_NAME as PACKAGING_RECYCLING_NOTES_COLLECTION_NAME,
  createPackagingRecyclingNotesRepository
} from './repository/mongodb.js'

/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */

/**
 * The MongoDB adapter for the PRN repository. Its `findByStatus` leaves out
 * the PRNs of the organisations in `excludeOrganisationNumbers`.
 */
export const packagingRecyclingNotesRepositoryPlugin = portAdapter({
  provides: 'packagingRecyclingNotesRepository',
  needs: ['mongodb'],

  /** @param {{ excludeOrganisationNumbers: Iterable<OrganisationNumber> }} options */
  build: async ({ excludeOrganisationNumbers }, { mongodb }) => {
    const createRepository = await createPackagingRecyclingNotesRepository(
      mongodb,
      excludeOrganisationNumbers
    )
    return ({ logger }) => createRepository(logger)
  }
})

/**
 * The PRN routes. With `adminCancellation`, it adds the routes that let the
 * service team cancel a PRN.
 */
export const packagingRecyclingNotesRoutesPlugin = {
  name: 'packaging-recycling-notes',
  dependencies: [
    'packagingRecyclingNotesRepository',
    'ledgerRepository',
    'organisationReadRepository',
    'prnEvents'
  ],

  /**
   * @param {HapiServer} server
   * @param {{ adminCancellation: boolean }} options
   */
  register: (server, { adminCancellation }) => {
    server.route([
      packagingRecyclingNotesAccept,
      packagingRecyclingNotesList,
      packagingRecyclingNotesReject,
      ...prnRoutesByNaturalKey,
      adminPackagingRecyclingNotesList,
      ...(adminCancellation
        ? [adminPackagingRecyclingNotesCancel, prnCancelByNaturalKey]
        : []),
      getPrnTonnage
    ])
  }
}
