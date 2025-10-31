import parse from 'joi-to-json'
import { organisationUpdateSchema } from '#repositories/organisations/schema.js'

export const getOrganisationJSONSchema = () => {
  return parse(organisationUpdateSchema, 'json-draft-2019-09')
}
