import { testUpsertRowStatesBehaviour } from './contract/upsertRowStates.contract.js'
import { testFindBySummaryLogIdBehaviour } from './contract/findBySummaryLogId.contract.js'
import { testFindRowHistoryBehaviour } from './contract/findRowHistory.contract.js'

export const testRowStateRepositoryContract = (it) => {
  testUpsertRowStatesBehaviour(it)
  testFindBySummaryLogIdBehaviour(it)
  testFindRowHistoryBehaviour(it)
}
