// The in-memory summary-log row state repository lives in `in-memory-store.js`
// so it ships in the production image for the discrepancy diagnostic's flag-off
// dry run. This module keeps the conventional `inmemory.js` name for test
// imports; it is excluded from the image by `.dockerignore`, so production code
// imports the store directly.
export { createInMemorySummaryLogRowStateRepository } from './in-memory-store.js'
