import { StatusCodes } from 'http-status-codes'

import { config } from '#root/config.js'
import { organisationYearsResponseSchema } from './response.schema.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  body,
  buildAccreditedOrganisation,
  useViewServer
} from './organisation-view-test-helpers.js'

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
    config.reset('openNextYear')
  })

  it('lists the years the organisation held approved registrations', async () => {
    const response = await get(
      `/organisations/${organisation.organisationNumber}/years`
    )

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual({ years: [2027, 2026] })
  })

  it('lists the next year while it is open', async () => {
    config.set('openNextYear', true)

    const response = await get(
      `/organisations/${organisation.organisationNumber}/years`
    )

    expect(body(response)).toEqual({ years: [2028, 2027, 2026] })
  })

  it('returns 404 for an unknown organisation', async () => {
    const response = await get('/organisations/999999/years')

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})

describe('organisationYearsResponseSchema', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2027-03-15') })
  })

  afterEach(() => {
    vi.useRealTimers()
    config.reset('openNextYear')
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

  it('rejects a year that has not started', () => {
    const { error } = organisationYearsResponseSchema.validate({
      years: [2028]
    })

    expect(error).toBeDefined()
  })

  it('accepts the next year while it is open', () => {
    config.set('openNextYear', true)

    const { error } = organisationYearsResponseSchema.validate({
      years: [2028]
    })

    expect(error).toBeUndefined()
  })
})
