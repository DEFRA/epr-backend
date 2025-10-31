import { testFindByLocationBehaviour } from './contract/find-by-location.contract.js'

export const testUploadsRepositoryContract = (repositoryFactory) => {
  describe('uploads repository contract', () => {
    testFindByLocationBehaviour(repositoryFactory)
  })
}
