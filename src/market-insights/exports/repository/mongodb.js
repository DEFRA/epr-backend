import { randomUUID } from 'node:crypto'
import {
  marketInsightsExportPeriodKey,
  MARKET_INSIGHTS_EXPORT_STATUS
} from '#market-insights/domain/export.js'

/** @import { Db, Collection } from 'mongodb' */
/** @import { MarketInsightsExport, MarketInsightsExportsRepositoryFactory } from './port.js' */

const COLLECTION_NAME = 'market-insights-exports'
const DUPLICATE_KEY = 11000

/**
 * The period key is the `_id`, so one record per reporting period is the
 * store's own guarantee rather than a rule this adapter has to keep.
 *
 * @typedef {Omit<MarketInsightsExport, 'id'> & { _id: string }} MarketInsightsExportDocument
 */

/**
 * @param {MarketInsightsExportDocument} doc
 * @returns {MarketInsightsExport}
 */
const toExport = ({ _id, ...rest }) => ({ id: _id, ...rest })

/**
 * @param {Db} db
 * @returns {Promise<MarketInsightsExportsRepositoryFactory>}
 */
export const createMarketInsightsExportsRepository = async (db) => {
  /** @type {Collection<MarketInsightsExportDocument>} */
  const collection = db.collection(COLLECTION_NAME)

  /**
   * @param {{ id: string, buildToken: string, now: Date }} build
   * @param {Partial<MarketInsightsExportDocument>} changes
   * @returns {Promise<boolean>}
   */
  const writeAsBuild = async ({ id, buildToken, now }, changes) => {
    const result = await collection.updateOne(
      { _id: id, buildToken },
      { $set: { ...changes, updatedAt: now.toISOString() } }
    )
    return result.matchedCount > 0
  }

  return () => ({
    async claimForBuild({ year, cadence, period, now, abandonedBefore }) {
      const id = marketInsightsExportPeriodKey({ year, cadence, period })
      const timestamp = now.toISOString()

      // The claim is one write: find this period's record unless a build is
      // running on it, take it over, and insert it when there is none. A
      // request that matches neither collides on `_id`, which is exactly the
      // answer "a build is already under way".
      try {
        const claimed = await collection.findOneAndUpdate(
          {
            _id: id,
            $or: [
              { status: { $ne: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING } },
              {
                status: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING,
                updatedAt: { $lt: abandonedBefore }
              }
            ]
          },
          {
            $set: {
              status: MARKET_INSIGHTS_EXPORT_STATUS.BUILDING,
              buildToken: randomUUID(),
              updatedAt: timestamp,
              failureReason: null
            },
            $setOnInsert: {
              year,
              cadence,
              period,
              createdAt: timestamp,
              generatedAt: null,
              s3Key: null
            }
          },
          { upsert: true, returnDocument: 'after' }
        )

        return { record: toExport(/** @type {any} */ (claimed)), claimed: true }
      } catch (err) {
        if (err.code !== DUPLICATE_KEY) {
          throw err
        }
        const current = await collection.findOne({ _id: id })
        return {
          record: toExport(/** @type {any} */ (current)),
          claimed: false
        }
      }
    },

    async findForPeriod(periodRef) {
      const doc = await collection.findOne({
        _id: marketInsightsExportPeriodKey(periodRef)
      })
      return doc ? toExport(doc) : null
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
