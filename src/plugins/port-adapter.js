import { registerDependency } from '#plugins/register-dependency.js'

/** @import { Server } from '@hapi/hapi' */
/** @import { Db } from 'mongodb' */
/** @import { ServerApp, TypedLogger } from '#common/hapi-types.js' */

/** @typedef {ServerApp & { mongodb: Db }} Needable */

/**
 * A Hapi plugin for one adapter of a port, named after the port. When the
 * server starts, it builds the adapter from the plugin's options and the
 * dependencies it declares, and provides the port on `server.app` and on each
 * request with that request's logger. A dependency named `mongodb` is the
 * database.
 *
 * @template {keyof ServerApp} P
 * @template {keyof Needable} N
 * @template O
 * @param {{
 *   provides: P
 *   needs: N[]
 *   build: (
 *     options: O,
 *     needs: Pick<Needable, N>
 *   ) => (request: { logger: TypedLogger }) => ServerApp[P]
 * }} adapter
 */
export const portAdapter = ({ provides, needs, build }) => ({
  name: provides,
  version: '1.0.0',

  /**
   * @param {Server} server
   * @param {O} options
   */
  register: (server, options) => {
    server.dependency(needs, async (started) => {
      const needed = /** @type {Pick<Needable, N>} */ (
        Object.fromEntries(
          needs.map((name) => [
            name,
            name === 'mongodb'
              ? /** @type {Server & { db: Db }} */ (started).db
              : /** @type {ServerApp} */ (started.app)[
                  /** @type {keyof ServerApp} */ (name)
                ]
          ])
        )
      )
      registerDependency(started, provides, build(options, needed))
    })
  }
})
