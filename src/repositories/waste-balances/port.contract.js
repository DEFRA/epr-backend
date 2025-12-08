import { testFindByAccreditationIdBehaviour } from './contract/findByAccreditationId.contract.js'

export const testWasteBalancesRepositoryContract = (repositoryFactory) => {
  testFindByAccreditationIdBehaviour(repositoryFactory)
}
