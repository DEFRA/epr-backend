import crypto from 'node:crypto'
import { ObjectId } from 'mongodb'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }

const ORG_ID_START = 500000
export const generateOrgId = () => ORG_ID_START + crypto.randomInt(0, 100000)

function deleteStatusForItems(items) {
  if (Array.isArray(items)) {
    for (const item of items) {
      delete item.status
      delete item.statusHistory
    }
  }
}

export const buildRegistration = (overrides = {}) => ({
  id: new ObjectId().toString(),
  orgName: 'Test Org',
  material: 'glass',
  wasteProcessingType: 'reprocessor',
  wasteRegistrationNumber: 'CBDU111111',
  formSubmissionTime: '2025-08-20T19:34:44.944Z',
  submittedToRegulator: 'ea',
  ...overrides
})

export const buildAccreditation = (overrides = {}) => ({
  id: new ObjectId().toString(),
  accreditationNumber: 87654321,
  material: 'glass',
  wasteProcessingType: 'reprocessor',
  formSubmissionTime: '2025-08-19T19:34:44.944Z',
  submittedToRegulator: 'ea',
  ...overrides
})

export const buildOrganisation = (overrides = {}) => {
  const { statusHistory: _statusHistory, ...baseOrg } = org1

  const org = {
    ...baseOrg,
    orgId: generateOrgId(),
    id: new ObjectId().toString(),
    ...overrides
  }

  deleteStatusForItems(org.registrations)
  deleteStatusForItems(org.accreditations)

  return org
}
