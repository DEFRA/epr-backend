import { registerRepository } from '#plugins/register-repository.js'
import { createNonProdDataReset } from './mongodb.js'

/**
 * Registers request.nonProdDataReset only when FEATURE_FLAG_DEV_ENDPOINTS is
 * enabled. When the flag is off, this plugin is not added to the server at
 * all, so the capability literally does not exist on the request object.
 * This is defence in depth beyond the router-level route gate in
 * plugins/router.js.
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
    const reset = createNonProdDataReset(db)
    registerRepository(server, 'nonProdDataReset', () => reset)
  }
}
