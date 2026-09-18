import { randomUUID } from 'node:crypto'
import { registerDependency } from '#plugins/register-dependency.js'
import {
  marketInsightsExportPeriodKey,
  MARKET_INSIGHTS_EXPORT_STATUS
} from '#market-insights/domain/export.js'

/** @import { MarketInsightsExport, MarketInsightsExportsRepositoryFactory } from './port.js' */

/**
 * Whether work is still happening on this export, which is the one and only
 * reason a request joins it rather than building the period again.
 *
 * @param {MarketInsightsExport} doc
 * @param {string} abandonedBefore - ISO 8601
 * @returns {boolean}
 */
const isBuilding = (doc, abandonedBefore) =>
  doc.status === MARKET_INSIGHTS_EXPORT_STATUS.BUILDING &&
  doc.updatedAt >= abandonedBefore

/**
 * @returns {MarketInsightsExportsRepositoryFactory}
 */
export const createInMemoryMarketInsightsExportsRepository = () => {
  /** @type {Map<string, MarketInsightsExport>} */
  const storage = new Map()

  /**
   * @param {{ id: string, buildToken: string, now: Date }} build
   * @param {Partial<MarketInsightsExport>} changes
   * @returns {boolean}
   */
  const writeAsBuild = ({ id, buildToken, now }, changes) => {
    const doc = storage.get(id)
    if (doc === undefined || doc.buildToken !== buildToken) {
      return false
    }
    storage.set(id, {
      ...doc,
      ...changes,
      updatedAt: now.toISOString()
    })
    return true
  }

  return () => ({
    async claimForBuild({ year, cadence, period, now, abandonedBefore }) {
      // Nothing awaits between the look-up and the write, so this settles the
      // claim as indivisibly as the MongoDB adapter's upsert does.
      const id = marketInsightsExportPeriodKey({ year, cadence, period })
      const existing = storage.get(id)

      if (existing !== undefined && isBuilding(existing, abandonedBefore)) {
        return { record: structuredClone(existing), claimed: false }
      }

      const timestamp = now.toISOString()
      /** @type {MarketInsightsExport} */
      const claimed = {
        ...(existing ?? {
          id,
          year,
          cadence,
          period,
          createdAt: timestamp,
          generatedAt: null,
          s3Key: null
        }),
        status: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING,
        buildToken: randomUUID(),
        updatedAt: timestamp,
        failureReason: null
      }
      storage.set(id, claimed)
      return { record: structuredClone(claimed), claimed: true }
    },

    async findForPeriod(periodRef) {
      const doc = storage.get(marketInsightsExportPeriodKey(periodRef))
      return doc ? structuredClone(doc) : null
    },

    async markReady({ generatedAt, s3Key, ...build }) {
      return writeAsBuild(build, {
        status: MARKET_INSIGHTS_EXPORT_STATUS.READY,
        generatedAt,
        s3Key
      })
    },

    async markFailed({ failureReason, ...build }) {
      return writeAsBuild(build, {
        status: MARKET_INSIGHTS_EXPORT_STATUS.FAILED,
        failureReason
      })
    }
  })
}

export const createInMemoryMarketInsightsExportsRepositoryPlugin = () => {
  const repository = createInMemoryMarketInsightsExportsRepository()()

  return {
    name: 'marketInsightsExportsRepository',
    register: (server) => {
      registerDependency(
        server,
        'marketInsightsExportsRepository',
        () => repository
      )
    }
  }
}
