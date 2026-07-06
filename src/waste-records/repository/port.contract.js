import { testUpsertSummaryLogRowStatesBehaviour } from './contract/upsertSummaryLogRowStates.contract.js'
import { testFindBySummaryLogIdBehaviour } from './contract/findBySummaryLogId.contract.js'
import { testFindRowHistoryBehaviour } from './contract/findRowHistory.contract.js'

export const testSummaryLogRowStateRepositoryContract = (it) => {
  testUpsertSummaryLogRowStatesBehaviour(it)
  testFindBySummaryLogIdBehaviour(it)
  testFindRowHistoryBehaviour(it)
}
