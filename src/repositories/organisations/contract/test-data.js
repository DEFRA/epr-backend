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
