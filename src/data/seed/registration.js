import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '../../common/enums/index.js'

const registration = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function registrationFactory(
  orgId,
  referenceNumber,
  partialRegistration = {}
) {
  return deepmerge(registration, {
    ...partialRegistration,
    orgId,
    referenceNumber
  })
}
