import Joi from 'joi'

import { buildOrganisation } from '#repositories/organisations/contract/test-data.js'
import { createInMemoryOrganisationsRepository } from '#repositories/organisations/inmemory.js'
import { partialMock } from '#test/type-helpers.js'
import { atNaturalKeys } from './at-natural-keys.js'
import {
  REPROCESSOR_NUMBER,
  accreditation,
  reprocessor
} from './organisation-view-test-helpers.js'
import { registrationParams } from './view-route.js'

const REGISTERED_ONLY_NUMBER = 'R26ER5001180099PL'

const accredited = accreditation()
const registeredOnlyRegistration = reprocessor({
  registrationNumber: REGISTERED_ONLY_NUMBER
})
const accreditedRegistration = reprocessor({ accreditationId: accredited.id })
const organisation = buildOrganisation({
  registrations: [registeredOnlyRegistration, accreditedRegistration],
  accreditations: [accredited]
})

const scopes = { scope: ['organisation:read'] }
const payloadSchema = Joi.object({ name: Joi.string() })

const route = {
  method: 'GET',
  options: { auth: scopes, validate: { payload: payloadSchema } },
  handler: vi.fn(async (request) => request.params)
}

/**
 * @param {object} params
 */
const requestFor = (params) =>
  partialMock({
    params,
    organisationsRepository: createInMemoryOrganisationsRepository([
      partialMock(organisation)
    ])()
  })

const h = partialMock({})

describe('atNaturalKeys', () => {
  it('keeps the route options and swaps the params validation', () => {
    const served = atNaturalKeys(route, '/served', registrationParams)

    expect(served).toMatchObject({
      method: 'GET',
      path: '/served',
      options: { auth: scopes, validate: { payload: payloadSchema } }
    })
    expect(
      served.options.validate.params.validate({
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER
      }).error
    ).toBeUndefined()
  })

  it('serves a route that has no validation of its own', () => {
    const served = atNaturalKeys(
      { ...route, options: { auth: scopes } },
      '/served',
      registrationParams
    )

    expect(served.options.validate.params).toBeDefined()
  })

  it('passes the stored ids to the handler, with no accreditation', async () => {
    const served = atNaturalKeys(route, '/served', registrationParams)

    const params = await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER
      }),
      h
    )

    expect(params).toMatchObject({
      organisationId: organisation.id,
      registrationId: registeredOnlyRegistration.id,
      accreditationId: null
    })
  })

  it("passes the accreditation for the year to an accredited route's handler", async () => {
    const served = atNaturalKeys(route, '/served', registrationParams, {
      accredited: true
    })

    const params = await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER,
        year: 2026
      }),
      h
    )

    expect(params).toMatchObject({
      registrationId: accreditedRegistration.id,
      accreditationId: accredited.id
    })
  })

  it('runs the before step with the stored ids, before the handler', async () => {
    const calls = []
    const before = vi.fn((request) => {
      calls.push(['before', request.params.registrationId])
    })
    const handler = vi.fn(async () => calls.push(['handler']))
    const served = atNaturalKeys(
      { ...route, handler },
      '/served',
      registrationParams,
      { before }
    )

    await served.handler(
      requestFor({
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER
      }),
      h
    )

    expect(calls).toEqual([
      ['before', registeredOnlyRegistration.id],
      ['handler']
    ])
  })

  it.each([
    [
      'an unknown organisation',
      { organisationNumber: 999999, registrationNumber: REPROCESSOR_NUMBER },
      false
    ],
    [
      'an unknown registration',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: 'R26XX0000000000PL'
      },
      false
    ],
    [
      'a year the registration has no accreditation for',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: REPROCESSOR_NUMBER,
        year: 2027
      },
      true
    ],
    [
      'a registration with no accreditation',
      {
        organisationNumber: organisation.orgId,
        registrationNumber: REGISTERED_ONLY_NUMBER,
        year: 2026
      },
      true
    ]
  ])('rejects %s as not found', async (_, params, isAccredited) => {
    const served = atNaturalKeys(route, '/served', registrationParams, {
      accredited: isAccredited
    })

    await expect(served.handler(requestFor(params), h)).rejects.toMatchObject({
      output: { statusCode: 404 }
    })
  })
})
