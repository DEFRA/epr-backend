import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '../../common/enums/index.js'

const organisation = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function organisationFactory(orgId, partialOrganisation = {}) {
  return deepmerge(organisation, { ...partialOrganisation, orgId })
}
