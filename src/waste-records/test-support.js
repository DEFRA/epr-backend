// What other modules' tests may use from waste records. Production code does not import it.

export { createInMemorySummaryLogRowStatesRepository } from './repository/inmemory.js'
export {
  SUMMARY_LOG_ROW_STATES_COLLECTION_NAME,
  createMongoSummaryLogRowStatesRepository,
  ensureSummaryLogRowStatesCollection
} from './repository/mongodb.js'
export {
  DEFAULT_YEAR,
  buildSummaryLogRowStateEntry,
  withNumbers
} from './repository/test-data.js'
export {
  emptySummaryLogStores,
  submitSummaryLog
} from '#vite/helpers/submit-summary-log.js'

/** @typedef {import('#vite/helpers/submit-summary-log.js').SummaryLogStores} SummaryLogStores */
