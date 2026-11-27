import { portAdapter } from '#plugins/port-adapter.js'
import { createMongoPackagingRecyclingNotesRepository } from './repository/mongodb.js'
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
export { reconcileStalePrnProjectionsPlugin } from './application/reconcile-stale-prn-projections.plugin.js'

/** @import { HapiServer } from '#common/hapi-types.js' */
/** @import { OrganisationNumber } from '#domain/organisations/numbers.js' */
/** @import { DecemberWasteWindow } from './domain/december-waste-window.js' */

/**
 * The MongoDB adapter for the PRN repository. Its `findByStatus` leaves out
 * the PRNs of the organisations in `excludeOrganisationNumbers`.
 */
export const packagingRecyclingNotesRepositoryPlugin = portAdapter({
  provides: 'packagingRecyclingNotesRepository',
  needs: ['mongodb'],

  /** @param {{ excludeOrganisationNumbers: Iterable<OrganisationNumber> }} options */
  build: async ({ excludeOrganisationNumbers }, { mongodb }) => {
    const createRepository = await createMongoPackagingRecyclingNotesRepository(
      mongodb,
      excludeOrganisationNumbers
    )
    return ({ logger }) => createRepository(logger)
  }
})

/**
 * The PRN routes. With `adminCancellation`, it adds the routes that let the
 * service team cancel a PRN. `decemberWaste` sets when the December Waste
 * declaration window opens.
 */
export const packagingRecyclingNotesRoutesPlugin = {
  name: 'packaging-recycling-notes-routes',
  dependencies: [
    'packagingRecyclingNotesRepository',
    'ledgerRepository',
    'organisationReadRepository',
    'prnEvents',
    'systemLogsRepository'
  ],

  /**
   * @param {HapiServer} server
   * @param {{ adminCancellation: boolean, decemberWaste: DecemberWasteWindow }} options
   */
  register: (server, { adminCancellation, decemberWaste }) => {
    server.route([
      packagingRecyclingNotesAccept,
      packagingRecyclingNotesList,
      packagingRecyclingNotesReject,
      ...prnRoutesByNaturalKey({ decemberWaste }),
      adminPackagingRecyclingNotesList,
      ...(adminCancellation
        ? [adminPackagingRecyclingNotesCancel, prnCancelByNaturalKey]
        : []),
      getPrnTonnage
    ])
  }
}
