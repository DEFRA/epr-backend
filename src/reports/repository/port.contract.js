import { testCreateReportBehaviour } from './contract/createReport.contract.js'
import { testUpdateReportBehaviour } from './contract/updateReport.contract.js'
import { testUpdateReportStatusBehaviour } from './contract/updateReportStatus.contract.js'
import { testDeleteReportBehaviour } from './contract/deleteReport.contract.js'
import { testFindPeriodicReportsBehaviour } from './contract/findPeriodicReports.contract.js'
import { testFindAllPeriodicReportsBehaviour } from './contract/findAllPeriodicReports.contract.js'
import { testFindReportByIdBehaviour } from './contract/findReportById.contract.js'
import { testMarkActiveReportsStaleForSummaryLogBehaviour } from './contract/markActiveReportsStaleForSummaryLog.contract.js'
import { testMarkActiveReportsStaleForPrnCancellationBehaviour } from './contract/markActiveReportsStaleForPrnCancellation.contract.js'
import { testMarkSubmittedReportsRequiringResubmissionBehaviour } from './contract/markSubmittedReportsRequiringResubmission.contract.js'
import { testMarkSubmittedReportRequiringResubmissionByOperatorBehaviour } from './contract/markSubmittedReportRequiringResubmissionByOperator.contract.js'
import { testHasReportSubmittedSinceBehaviour } from './contract/hasReportSubmittedSince.contract.js'

export const testReportsRepositoryContract = (it) => {
  testCreateReportBehaviour(it)
  testUpdateReportBehaviour(it)
  testUpdateReportStatusBehaviour(it)
  testDeleteReportBehaviour(it)
  testFindPeriodicReportsBehaviour(it)
  testFindAllPeriodicReportsBehaviour(it)
  testFindReportByIdBehaviour(it)
  testMarkActiveReportsStaleForSummaryLogBehaviour(it)
  testMarkActiveReportsStaleForPrnCancellationBehaviour(it)
  testMarkSubmittedReportsRequiringResubmissionBehaviour(it)
  testMarkSubmittedReportRequiringResubmissionByOperatorBehaviour(it)
  testHasReportSubmittedSinceBehaviour(it)
}
