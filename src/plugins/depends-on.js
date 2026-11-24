/** @import { ServerApp } from '#common/hapi-types.js' */

/**
 * What each plugin that another plugin declares with `dependsOn` provides,
 * by the plugin's name.
 *
 * @typedef {{
 *   mongodb: never
 *   organisationReadRepository: 'organisationReadRepository'
 *   organisationsRepository: 'organisationAdministrationRepository' | 'organisationLinkingRepository'
 *   overseasSitesRepository: 'overseasSitesRepository'
 *   reportsRepository: 'reportsRepository'
 *   summaryLogsRepository: 'summaryLogsRepository'
 *   systemLogsRepository: 'systemLogsRepository'
 *   uploadsRepository: 'uploadsRepository'
 *   wasteBalanceService: 'wasteBalanceService'
 * }} Provides
 */

/** @typedef {keyof Provides} PluginName */

/**
 * Declares the plugins a plugin needs, by name, so the server refuses to
 * start without them. With `after`, it runs `after` at the first initialise,
 * once the named plugins' own `after` callbacks have run, and `after` reads
 * only what those plugins provide.
 *
 * @template {PluginName} N
 * @param {{ dependency: Function, app: object }} server
 * @param {N[]} names
 * @param {(app: Pick<ServerApp, Provides[N]>) => void} [after]
 */
export const dependsOn = (server, names, after) => {
  let ran = false
  server.dependency(
    names,
    after &&
      (() => {
        if (!ran) {
          ran = true
          after(/** @type {ServerApp} */ (server.app))
        }
      })
  )
}
