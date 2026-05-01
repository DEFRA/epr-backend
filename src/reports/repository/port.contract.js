import { testCreateReportBehaviour } from './contract/createReport.contract.js'
import { testUpdateReportBehaviour } from './contract/updateReport.contract.js'
import { testUpdateReportStatusBehaviour } from './contract/updateReportStatus.contract.js'
import { testUnsubmitReportBehaviour } from './contract/unsubmitReport.contract.js'
import { testDeleteReportBehaviour } from './contract/deleteReport.contract.js'
import { testFindPeriodicReportsBehaviour } from './contract/findPeriodicReports.contract.js'
import { testFindAllPeriodicReportsBehaviour } from './contract/findAllPeriodicReports.contract.js'
import { testFindReportByIdBehaviour } from './contract/findReportById.contract.js'

export const testReportsRepositoryContract = (it) => {
  testCreateReportBehaviour(it)
  testUpdateReportBehaviour(it)
  testUpdateReportStatusBehaviour(it)
  testUnsubmitReportBehaviour(it)
  testDeleteReportBehaviour(it)
  testFindPeriodicReportsBehaviour(it)
  testFindAllPeriodicReportsBehaviour(it)
  testFindReportByIdBehaviour(it)
}
