// What other modules' tests may use from reports. Production code does not import it.

export {
  DEFAULT_ORG_ID,
  DEFAULT_ORG_NUMBER,
  DEFAULT_REG_ID,
  DEFAULT_REG_NUMBER,
  DEFAULT_REPORT_START_DATE,
  DEFAULT_REPORT_YEAR,
  NEXT_YEAR_REPORT,
  buildCreateReportParams,
  createAndSubmitReport,
  reportKeyOf,
  uniqueRegistrationNumber
} from './repository/contract/test-data.js'
export { createInMemoryReportsRepository } from './repository/inmemory.js'
export { createReportsRepository } from './repository/mongodb.js'
export { buildDraftReport } from '#vite/helpers/build-draft-report.js'
export { buildSubmittedReport } from '#vite/helpers/build-submitted-report.js'
export { buildUnsubmittedReport } from '#vite/helpers/build-unsubmitted-report.js'
export { createDraftReport } from '#vite/helpers/create-draft-report.js'
export { createAccreditedOperatorInserter } from '#vite/helpers/insert-accredited-operator.js'
export { seedInFlightResubmission } from '#vite/helpers/seed-inflight-resubmission.js'

/** @typedef {import('#vite/helpers/insert-accredited-operator.js').AccreditedFor} AccreditedFor */
