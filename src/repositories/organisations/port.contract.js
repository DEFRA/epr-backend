import { testFindBehaviour } from './contract/find.contract.js'
import { testFindAllIdsBehaviour } from './contract/find-all-ids.contract.js'
import { testInsertBehaviour } from './contract/insert.contract.js'
import { testUpdateBehaviour } from './contract/update.contract.js'
import { testUpsertBehaviour } from './contract/upsert.contract.js'
import { testDataIsolationBehaviour } from './contract/data-isolation.contract.js'
import { testFindRegistrationByIdBehaviour } from './contract/find-registration-by-id.contract.js'
import { testFindAccreditationByIdBehaviour } from './contract/find-accreditation-by-id.contract.js'

export const testOrganisationsRepositoryContract = (repositoryFactory) => {
  testInsertBehaviour(repositoryFactory)
  testUpdateBehaviour(repositoryFactory)
  testUpsertBehaviour(repositoryFactory)
  testFindBehaviour(repositoryFactory)
  testFindAllIdsBehaviour(repositoryFactory)
  testFindRegistrationByIdBehaviour(repositoryFactory)
  testFindAccreditationByIdBehaviour(repositoryFactory)
  testDataIsolationBehaviour(repositoryFactory)
}
