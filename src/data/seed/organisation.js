import deepmerge from 'deepmerge'
import { addressFactory } from './address.js'
import { REGION, SCHEMA_VERSION } from '../../common/enums/index.js'

const organisation = {
  schemaVersion: SCHEMA_VERSION,
  region: REGION.ENGLAND,
  address: addressFactory(undefined, { useGridRef: true }),
  rawSubmissionData: {}
}

export function organisationFactory(orgId, partialOrganisation = {}) {
  return deepmerge(organisation, { ...partialOrganisation, orgId })
}
