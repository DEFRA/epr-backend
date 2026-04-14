import { registerRepository } from '#plugins/register-repository.js'

/** @import { NonProdDataReset } from './mongodb.js' */

/** @type {NonProdDataReset} */
const noopReset = {
  async deleteByOrgId() {
    return {}
  }
}

/**
 * Default in-memory stub for tests. Returns an empty counts object. Individual
 * test suites that exercise the dev delete handler should override this via
 * `createTestServer({ repositories: { nonProdDataReset: stub } })`.
 */
export const createInMemoryNonProdDataResetPlugin = () => ({
  name: 'nonProdDataReset',
  register: (server) => {
    registerRepository(server, 'nonProdDataReset', () => noopReset)
  }
})
