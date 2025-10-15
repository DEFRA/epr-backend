import {
  testInsertBehaviour,
  testInsertRaceConditions,
  testInsertValidationRequiredFields,
  testInsertValidationFieldHandling,
  testInsertValidationStatusBasedS3
} from './contract/insert.contract.js'
import {
  testFindById,
  testFindByIdValidation
} from './contract/find.contract.js'
import {
  testUpdateBehaviour,
  testUpdateValidation
} from './contract/update.contract.js'
import {
  testOptimisticConcurrency,
  testOptimisticConcurrencyRaceConditions
} from './contract/optimistic-concurrency.contract.js'

export const testSummaryLogsRepositoryContract = (createRepository) => {
  describe('summary logs repository contract', () => {
    let repository

    beforeEach(async () => {
      repository = await createRepository()
    })

    testInsertBehaviour(() => repository)
    testInsertRaceConditions(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldHandling(() => repository)
    testInsertValidationStatusBasedS3(() => repository)
    testFindById(() => repository)
    testFindByIdValidation(() => repository)
    testUpdateBehaviour(() => repository)
    testUpdateValidation(() => repository)
    testOptimisticConcurrency(() => repository)
    testOptimisticConcurrencyRaceConditions(() => repository)
  })
}
