import { createOrganisationBuilders } from '#repositories/organisations/contract/test-data.js'
import { StatusCodes } from 'http-status-codes'

import { toYear } from '#common/helpers/dates/year.js'
import { toRegistrationNumber } from '#domain/organisations/numbers.js'
import { buildFutureAccreditation } from '#future-accreditations/repository/contract/test-data.js'
import { organisationYearsResponseSchema } from './response.schema.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  REPROCESSOR_NUMBER,
  body,
  createAccreditedOrganisationBuilder,
  useViewServer
} from './organisation-view-test-helpers.js'

const organisationBuilders = createOrganisationBuilders()
const buildAccreditedOrganisation =
  createAccreditedOrganisationBuilder(organisationBuilders)

describe('GET /organisations/{organisationNumber}/years', () => {
  setupAuthContext()

  const { serve, get } = useViewServer()

  const organisation = buildAccreditedOrganisation()

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
    await serve(organisation)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the years the organisation held approved registrations', async () => {
    const response = await get(`/organisations/${organisation.orgId}/years`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({ years: [2027, 2026] })
  })

  it('returns 404 for an unknown organisation', async () => {
    const response = await get('/organisations/999999/years')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('should list a later year a registration holds a stub accreditation for', async () => {
    await serve(organisation, [
      buildFutureAccreditation({
        registrationNumber: toRegistrationNumber(REPROCESSOR_NUMBER),
        year: toYear(2028)
      })
    ])

    const response = await get(`/organisations/${organisation.orgId}/years`)

    expect(body(response)).toStrictEqual({ years: [2028, 2027, 2026] })
  })
})

describe('organisationYearsResponseSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('accepts years up to the current year', () => {
    const { error } = organisationYearsResponseSchema.validate({
      years: [2027, 2026]
    })

    expect(error).toBeUndefined()
  })

  it('rejects a repeated year', () => {
    const { error } = organisationYearsResponseSchema.validate({
      years: [2027, 2026, 2026]
    })

    expect(error).toBeDefined()
  })

  it('should accept a year that has not started', () => {
    const { error } = organisationYearsResponseSchema.validate({
      years: [2028]
    })

    expect(error).toBeUndefined()
  })
})
