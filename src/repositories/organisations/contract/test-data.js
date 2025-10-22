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
  const org = {
    ...org1,
    orgId: generateOrgId(),
    id: new ObjectId().toString(),
    ...overrides
  }
  // @ts-ignore - Intentionally deleting properties for test data
  delete org.statusHistory
  // @ts-ignore - Intentionally deleting properties for test data
  delete org.status

  deleteStatusForItems(org.registrations)
  deleteStatusForItems(org.accreditations)

  return org
}
