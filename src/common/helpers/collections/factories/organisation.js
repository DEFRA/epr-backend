import deepmerge from 'deepmerge'
import { SCHEMA_VERSION } from '../../../enums/index.js'

const organisation = {
  schemaVersion: SCHEMA_VERSION,
  answers: {},
  rawSubmissionData: {}
}

export function organisationFactory({
  orgId,
  orgName,
  email,
  nations,
  answers,
  rawSubmissionData
}) {
  return deepmerge(organisation, {
    createdAt: new Date(),
    orgId,
    orgName,
    email,
    nations,
    answers,
    rawSubmissionData
  })
}
