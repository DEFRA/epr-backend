import { testUpsertRowStatesBehaviour } from './row-states-contract/upsertRowStates.contract.js'
import { testFindBySummaryLogIdBehaviour } from './row-states-contract/findBySummaryLogId.contract.js'
import { testFindRowHistoryBehaviour } from './row-states-contract/findRowHistory.contract.js'

export const testRowStateRepositoryContract = (it) => {
  testUpsertRowStatesBehaviour(it)
  testFindBySummaryLogIdBehaviour(it)
  testFindRowHistoryBehaviour(it)
}
