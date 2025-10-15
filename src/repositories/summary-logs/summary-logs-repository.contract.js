import {
  testInsertBehaviour,
  testInsertValidationRequiredFields,
  testInsertValidationFieldHandling,
  testInsertValidationStatusBasedS3
} from './contract/insert.contract.js'
import {
  testFindById,
  testFindByIdValidation
} from './contract/find.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testOptimisticConcurrency } from './contract/optimistic-concurrency.contract.js'

export const testSummaryLogsRepositoryContract = (createRepository) => {
  describe('summary logs repository contract', () => {
    let repository

    beforeEach(async () => {
      repository = await createRepository()
    })

    testInsertBehaviour(() => repository)
    testInsertValidationRequiredFields(() => repository)
    testInsertValidationFieldHandling(() => repository)
    testInsertValidationStatusBasedS3(() => repository)
    testFindById(() => repository)
    testFindByIdValidation(() => repository)
    testUpdateBehaviour(() => repository)
    testOptimisticConcurrency(() => repository)
  })
}
