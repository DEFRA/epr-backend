import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '#common/enums/index.js'

const registration = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function registrationFactory({
  orgId,
  referenceNumber,
  answers,
  rawSubmissionData
}) {
  return deepmerge(registration, {
    createdAt: new Date(),
    referenceNumber,
    orgId,
    answers,
    rawSubmissionData
  })
}
