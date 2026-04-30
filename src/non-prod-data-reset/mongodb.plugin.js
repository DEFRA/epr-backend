import { isProductionEnvironment } from '#root/config.js'
import { registerRepository } from '#plugins/register-repository.js'
import { createNonProdDataReset } from './mongodb.js'

/**
 * Registers request.nonProdDataReset only when FEATURE_FLAG_DEV_ENDPOINTS is
 * enabled. When the flag is off, this plugin is not added to the server at
 * all, so the capability literally does not exist on the request object.
 * This is defence in depth beyond the router-level route gate in
 * plugins/router.js. As a final safety net, the adapter itself refuses to
 * run cascade deletes when the CDP environment is prod.
 *
 * Note: we gate on cdpEnvironment rather than config.isProduction because
 * the latter is derived from NODE_ENV, which CDP sets to 'production' in
 * every environment (dev/test/prod). Using it here would disable the dev
 * cleanup endpoint in non-prod CDP envs, which is exactly where the
 * frontend journey tests need it.
 */
export const nonProdDataResetPlugin = {
  name: 'nonProdDataReset',
  version: '1.0.0',
  dependencies: ['mongodb'],
  register: (
    /** @type {import('@hapi/hapi').Server & {db: import('mongodb').Db}} */ server,
    /** @type {{db?: import('mongodb').Db}} */ options = {}
  ) => {
    const db = options?.db ?? server.db
    const reset = createNonProdDataReset(db, {
      isProduction: isProductionEnvironment()
    })
    registerRepository(server, 'nonProdDataReset', () => reset)
  }
}
