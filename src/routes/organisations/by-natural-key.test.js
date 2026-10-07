import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from '#organisation-read-model/repository/contract/organisation-read-test-helpers.js'
import {
  accreditationIds,
  organisationIds,
  registrationIds
} from './by-natural-key.js'

/** @import { HapiRequest } from '#common/hapi-types.js' */

const accredited = accreditation()
const registration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registration],
  accreditations: [accredited]
})

const params = {
  organisationNumber: organisation.orgId,
  registrationNumber: REPROCESSOR_NUMBER,
  year: '2026'
}

/** @returns {HapiRequest & { params: typeof params }} */
const request = () =>
  partialMock({
    organisationsRepository: createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])(),
    params
  })

describe('resolving natural keys to stored ids', () => {
  it("resolves an organisation's id", async () => {
    expect(await organisationIds(request())).toStrictEqual({
      organisationId: organisation.id
    })
  })

  it("resolves a registration's ids", async () => {
    expect(await registrationIds(request())).toStrictEqual({
      organisationId: organisation.id,
      registrationId: registration.id
    })
  })

  it("resolves the ids of a registration's accreditation for a year", async () => {
    expect(await accreditationIds(request())).toStrictEqual({
      organisationId: organisation.id,
      registrationId: registration.id,
      accreditationId: accredited.id
    })
  })
})
