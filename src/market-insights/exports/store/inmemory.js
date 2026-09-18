import { registerDependency } from '#plugins/register-dependency.js'

/** @import { MarketInsightsExportStore } from './port.js' */

const MILLISECONDS_PER_SECOND = 1000
const PRESIGNED_URL_EXPIRY_SECONDS = 3600

/**
 * @returns {MarketInsightsExportStore & { read: (key: string) => Buffer | undefined }}
 */
export const createInMemoryMarketInsightsExportStore = () => {
  /** @type {Map<string, Buffer>} */
  const storage = new Map()

  return {
    async save({ key, body }) {
      storage.set(key, body)
    },

    async signDownload({ key, fileName }) {
      return {
        url: `https://market-insights-exports.s3.example/${key}?filename=${encodeURIComponent(fileName)}`,
        expiresAt: new Date(
          Date.now() + PRESIGNED_URL_EXPIRY_SECONDS * MILLISECONDS_PER_SECOND
        ).toISOString()
      }
    },

    read: (key) => storage.get(key)
  }
}

export const createInMemoryMarketInsightsExportStorePlugin = () => {
  const store = createInMemoryMarketInsightsExportStore()

  return {
    name: 'marketInsightsExportStore',
    register: (server) => {
      registerDependency(server, 'marketInsightsExportStore', () => store)
    }
  }
}
