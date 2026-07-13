import { testUpsertSummaryLogRowStatesBehaviour } from './contract/upsertSummaryLogRowStates.contract.js'
import { testFindRowStatesForSummaryLogBehaviour } from './contract/findRowStatesForSummaryLog.contract.js'
import { testFindRowHistoryBehaviour } from './contract/findRowHistory.contract.js'

export const testSummaryLogRowStateRepositoryContract = (it) => {
  testUpsertSummaryLogRowStatesBehaviour(it)
  testFindRowStatesForSummaryLogBehaviour(it)
  testFindRowHistoryBehaviour(it)
}
