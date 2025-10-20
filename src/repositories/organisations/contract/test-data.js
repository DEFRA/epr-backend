import { ObjectId } from 'mongodb'
import org1 from '#data/fixtures/common/epr-organisations/sample-organisation-1.json' with { type: 'json' }

export const generateOrgId = () => Math.floor(Math.random() * 100) + 500000

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
  delete org.statusHistory
  delete org.status

  deleteStatusForItems(org.registrations)
  deleteStatusForItems(org.accreditations)

  return org
}
