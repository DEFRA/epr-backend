import { testUpsertSummaryLogRowStatesBehaviour } from './contract/upsertSummaryLogRowStates.contract.js'
import { testFindRowStatesForSummaryLogBehaviour } from './contract/findRowStatesForSummaryLog.contract.js'
import { testFindRowStatesForSummaryLogFileBehaviour } from './contract/findRowStatesForSummaryLogFile.contract.js'
import { testFindRowHistoryBehaviour } from './contract/findRowHistory.contract.js'
import { testStreamRowStatesForSummaryLogsBehaviour } from './contract/streamRowStatesForSummaryLogs.contract.js'
import { testFindDistinctDataKeysBehaviour } from './contract/findDistinctDataKeys.contract.js'

export const testSummaryLogRowStatesRepositoryContract = (it) => {
  testUpsertSummaryLogRowStatesBehaviour(it)
  testFindRowStatesForSummaryLogBehaviour(it)
  testFindRowStatesForSummaryLogFileBehaviour(it)
  testFindRowHistoryBehaviour(it)
  testStreamRowStatesForSummaryLogsBehaviour(it)
  testFindDistinctDataKeysBehaviour(it)
}
