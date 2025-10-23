import { ObjectId } from 'mongodb'
import { SCHEMA_VERSION } from '#common/enums/index.js'

export function eprOrganisationFactory({ id, ...eprOrganisation }) {
  return {
    ...eprOrganisation,
    _id: new ObjectId(id),
    schemaVersion: SCHEMA_VERSION
  }
}
