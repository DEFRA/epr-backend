import { testInsertAccreditationBehaviour } from './contract/insert-accreditation.contract.js'
import { testInsertRegistrationBehaviour } from './contract/insert-registration.contract.js'
import { testInsertOrganisationBehaviour } from './contract/insert-organisation.contract.js'

export const testApplicationsRepositoryContract = (repositoryFactory) => {
  describe('applications repository contract', () => {
    testInsertAccreditationBehaviour(repositoryFactory)
    testInsertRegistrationBehaviour(repositoryFactory)
    testInsertOrganisationBehaviour(repositoryFactory)
  })
}
