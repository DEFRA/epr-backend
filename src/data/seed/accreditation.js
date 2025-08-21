import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '../../common/enums/index.js'

const accreditation = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function accreditationFactory(
  orgId,
  referenceNumber,
  partialAccreditation = {}
) {
  return deepmerge(accreditation, {
    ...partialAccreditation,
    orgId,
    referenceNumber
  })
}
