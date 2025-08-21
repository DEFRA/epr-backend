import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '../../../enums/index.js'

const accreditation = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function accreditationFactory({
  orgId,
  referenceNumber,
  answers,
  rawSubmissionData
}) {
  return deepmerge(accreditation, {
    createdAt: new Date(),
    orgId,
    referenceNumber,
    answers,
    rawSubmissionData
  })
}
