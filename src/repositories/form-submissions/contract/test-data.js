import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'

const ORG_ID_START = 500000
export const generateOrgId = () => ORG_ID_START + crypto.randomInt(0, 100000)

const buildFormSubmission = (overrides = {}) => {
  return {
    id: new ObjectId().toString(),
    orgId: generateOrgId(),
    referenceNumber: new ObjectId().toString(),
    rawSubmissionData: {
      formData: { test: 'data' }
    },
    ...overrides
  }
}

export const buildAccreditation = (overrides = {}) =>
  buildFormSubmission(overrides)

export const buildRegistration = (overrides = {}) =>
  buildFormSubmission(overrides)

export const buildOrganisation = (overrides = {}) =>
  buildFormSubmission(overrides)
