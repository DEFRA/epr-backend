import parse from 'joi-to-json'
import { organisationJSONSchemaOverrides } from '../../src/repositories/organisations/schema/organisation-json-schema-overrides.js'

export const getOrganisationJSONSchema = () => {
  return parse(organisationJSONSchemaOverrides, 'json-draft-2019-09')
}
