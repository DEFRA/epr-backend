/** @import { ServerApp } from '#common/hapi-types.js' */
/** @import { PluginName, ProvidedBy } from '#plugins/modules.js' */

/**
 * Declares the plugins a plugin needs, by name, so the server refuses to
 * start without them. With `after`, Hapi calls it at every initialise, once
 * the named plugins' own `after` callbacks have run, and it reads only what
 * those plugins provide.
 *
 * @template {PluginName} N
 * @param {{ dependency: Function, app: object }} server
 * @param {N[]} names
 * @param {(app: Pick<ServerApp, ProvidedBy<N>>) => void} [after]
 */
export const dependsOn = (server, names, after) => {
  server.dependency(
    names,
    after && (() => after(/** @type {ServerApp} */ (server.app)))
  )
}
