import { runReconcileStalePrnProjections } from './run-reconcile-stale-prn-projections.js'

/** @import { HapiServer, StartedServer } from '#common/hapi-types.js' */

/**
 * Starts the sweep for stale PRN projections once the server has started,
 * without holding up the start.
 */
export const reconcileStalePrnProjectionsPlugin = {
  name: 'reconcile-stale-prn-projections',
  dependencies: [
    'mongodb',
    'packagingRecyclingNotesRepository',
    'wasteBalanceService'
  ],

  /** @param {HapiServer} server */
  register: (server) => {
    server.events.on('start', () => {
      void runReconcileStalePrnProjections(
        /** @type {StartedServer} */ (/** @type {unknown} */ (server))
      )
    })
  }
}
