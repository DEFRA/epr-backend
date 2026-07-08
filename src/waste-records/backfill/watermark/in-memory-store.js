/**
 * In-memory implementation of the summary-log-row-states backfill watermark
 * repository. Backed by a single map keyed by `(organisationId, registrationId)`
 * — fine for tests, fixtures, and contract verification. Not durable, not
 * concurrent-safe across processes. It also backs the flag-off dry run of the
 * discrepancy diagnostic: each ledger is reconstructed against a throwaway
 * instance of this store, so nothing is written to mongodb while the backfill
 * flag is off. Shipped in the production image for that path; the test-facing
 * `inmemory.js` re-exports it.
 *
 * The production use is a rollout-window mechanism only. Once the row-state
 * migration is complete, the flag-off dry run is removed and this store loses
 * its production role and becomes a test double again.
 *
 * @import { BackfillWatermark } from './port.js'
 */

const watermarkKey = (organisationId, registrationId) =>
  `${organisationId}\0${registrationId}`

/**
 * @returns {import('./port.js').SummaryLogRowStatesBackfillWatermarkRepositoryFactory}
 */
export const createInMemorySummaryLogRowStatesBackfillWatermarkRepository =
  () => {
    /** @type {Map<string, BackfillWatermark>} */
    const storage = new Map()

    return () => ({
      read: async (organisationId, registrationId) => {
        const watermark = storage.get(
          watermarkKey(organisationId, registrationId)
        )
        return watermark ? { ...watermark } : null
      },

      advance: async (organisationId, registrationId, watermark) => {
        storage.set(watermarkKey(organisationId, registrationId), {
          submittedAt: watermark.submittedAt,
          summaryLogId: watermark.summaryLogId
        })
      }
    })
  }
