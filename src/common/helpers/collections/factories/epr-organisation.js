import { ObjectId } from 'mongodb'
import { SCHEMA_VERSION } from '#common/enums/index.js'

import { generateInitialUsers } from '#domain/organisations/generate-initial-users.js'

export function eprOrganisationFactory({ id, ...eprOrganisation }) {
  return {
    ...eprOrganisation,
    _id: new ObjectId(id),
    schemaVersion: SCHEMA_VERSION,
    users: generateInitialUsers(eprOrganisation)
  }
}
