import parse from 'joi-to-json'
import { organisationReplaceSchema } from '#repositories/organisations/schema/organisation.js'

export const getOrganisationJSONSchema = () => {
  return parse(organisationReplaceSchema, 'json-draft-2019-09')
}
