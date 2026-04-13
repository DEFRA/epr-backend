import { testCreateReportBehaviour } from './contract/createReport.contract.js'
import { testUpdateReportBehaviour } from './contract/updateReport.contract.js'
import { testUpdateReportStatusBehaviour } from './contract/updateReportStatus.contract.js'
import { testDeleteReportBehaviour } from './contract/deleteReport.contract.js'
import { testDeleteByOrganisationIdBehaviour } from './contract/delete-by-organisation-id.contract.js'
import { testFindPeriodicReportsBehaviour } from './contract/findPeriodicReports.contract.js'
import { testFindReportByIdBehaviour } from './contract/findReportById.contract.js'

export const testReportsRepositoryContract = (it) => {
  testCreateReportBehaviour(it)
  testUpdateReportBehaviour(it)
  testUpdateReportStatusBehaviour(it)
  testDeleteReportBehaviour(it)
  testDeleteByOrganisationIdBehaviour(it)
  testFindPeriodicReportsBehaviour(it)
  testFindReportByIdBehaviour(it)
}
