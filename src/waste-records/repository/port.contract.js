import { testUpsertSummaryLogRowStatesBehaviour } from './contract/upsertSummaryLogRowStates.contract.js'
import { testFindWasteRecordStatesForSummaryLogBehaviour } from './contract/findWasteRecordStatesForSummaryLog.contract.js'
import { testFindWasteRecordStatesInPeriodBehaviour } from './contract/findWasteRecordStatesInPeriod.contract.js'
import { testFindRowStatesForSummaryLogFileBehaviour } from './contract/findRowStatesForSummaryLogFile.contract.js'
import { testFindRowStatesInSummaryLogBehaviour } from './contract/findRowStatesInSummaryLog.contract.js'
import { testStreamRowStatesForSummaryLogsBehaviour } from './contract/streamRowStatesForSummaryLogs.contract.js'
import { testNumbersBehaviour } from './contract/numbers.contract.js'
import { testYearBehaviour } from './contract/year.contract.js'

export const testSummaryLogRowStatesRepositoryContract = (it) => {
  testUpsertSummaryLogRowStatesBehaviour(it)
  testFindWasteRecordStatesForSummaryLogBehaviour(it)
  testFindWasteRecordStatesInPeriodBehaviour(it)
  testFindRowStatesForSummaryLogFileBehaviour(it)
  testFindRowStatesInSummaryLogBehaviour(it)
  testStreamRowStatesForSummaryLogsBehaviour(it)
  testNumbersBehaviour(it)
  testYearBehaviour(it)
}
