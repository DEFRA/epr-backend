import { testBuildOutcomeBehaviour } from './contract/build-outcome.contract.js'
import { testClaimBehaviour } from './contract/claim.contract.js'

export const testMarketInsightsExportsRepositoryContract = (it) => {
  describe('market insights exports repository contract', () => {
    testClaimBehaviour(it)
    testBuildOutcomeBehaviour(it)
  })
}
