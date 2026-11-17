// What other modules' tests may use from PRNs. Production code does not import it.

export {
  buildAccreditationKeys,
  buildAccreditationSnapshot,
  buildAwaitingAcceptancePrn,
  buildAwaitingAuthorisationPrn,
  buildDraftPrn,
  underAccreditation
} from './repository/contract/test-data.js'
export { createInMemoryPackagingRecyclingNotesRepository } from './repository/inmemory.plugin.js'
export {
  COLLECTION_NAME,
  createPackagingRecyclingNotesRepository
} from './repository/mongodb.js'
export {
  createMockIssuedPrn,
  generateExternalApiToken,
  generateExternalApiTokenWithoutClientId,
  testPublicKey
} from './routes/test-helpers.js'

/** @typedef {import('./repository/contract/test-data.js').AccreditationKeys} AccreditationKeys */
