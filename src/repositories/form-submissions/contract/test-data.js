import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import { ORG_ID_START_NUMBER } from '#common/enums/index.js'

export const generateOrgId = () =>
  ORG_ID_START_NUMBER + crypto.randomInt(0, 100000)

export const generateReferenceNumber = () => new ObjectId().toString()

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
