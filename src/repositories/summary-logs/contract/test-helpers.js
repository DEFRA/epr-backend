// Eventual consistency retry configuration
const MAX_RETRIES = 20
const RETRY_DELAY_MS = 25

/**
 * Polls repository until expected version appears or timeout occurs.
 * Works with both inmemory adapter (eventual consistency) and real MongoDB.
 *
 * @param {object} repository - Summary logs repository instance
 * @param {string} id - Summary log ID to poll
 * @param {number} expectedVersion - Version number to wait for
 * @returns {Promise<{version: number, summaryLog: object}>}
 * @throws {Error} If expected version not reached after MAX_RETRIES
 */
export const waitForVersion = async (repository, id, expectedVersion) => {
  for (let i = 0; i < MAX_RETRIES; i++) {
    const result = await repository.findById(id)
    if (result?.version >= expectedVersion) {
      return result
    }
    /* v8 ignore next 5 */
    if (i < MAX_RETRIES - 1) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  throw new Error(
    `Timeout waiting for version ${expectedVersion} on summary log ${id}`
  )
}
