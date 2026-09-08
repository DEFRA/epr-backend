import Boom from '@hapi/boom'
import { StatusCodes } from 'http-status-codes'
import {
  vi,
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  afterEach
} from 'vitest'

import { createTestServer } from '#test/create-test-server.js'
import { asOperator } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { packagingRecyclingNotesDecemberEligibilityPath } from './december-eligibility.js'

const organisationId = 'org-123'
const registrationId = 'reg-001'
const accreditationId = 'acc-789'

const url = `/v1/organisations/${organisationId}/registrations/${registrationId}/accreditations/${accreditationId}/packaging-recycling-notes/december-prn-eligibility`

describe(`${packagingRecyclingNotesDecemberEligibilityPath} route`, () => {
  setupAuthContext()

  let server
  let organisationsRepository

  beforeAll(async () => {
    organisationsRepository = {
      findAccreditationById: vi.fn(async () => ({
        id: accreditationId,
        validFrom: '2026-01-01',
        status: 'approved'
      }))
    }

    server = await createTestServer({
      repositories: {
        organisationsRepository: () => organisationsRepository
      }
    })

    await server.initialize()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('returns eligible: true when now is within the December window', async () => {
    vi.setSystemTime(new Date('2026-12-15T12:00:00.000Z'))

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ eligible: true })
  })

  it('returns eligible: false when now is outside the December window', async () => {
    vi.setSystemTime(new Date('2026-06-15T12:00:00.000Z'))

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ eligible: false })
  })

  it('returns eligible: true in January the year after the accreditation year', async () => {
    vi.setSystemTime(new Date('2027-01-31T23:59:00.000Z'))

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ eligible: true })
  })

  it('returns eligible: false the day after the deadline', async () => {
    vi.setSystemTime(new Date('2027-02-01T00:00:00.000Z'))

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toStrictEqual({ eligible: false })
  })

  it('returns 404 when the accreditation does not exist', async () => {
    organisationsRepository.findAccreditationById.mockRejectedValueOnce(
      Boom.notFound('Accreditation not found')
    )

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })

  it('returns 500 when the accreditation has no validFrom', async () => {
    organisationsRepository.findAccreditationById.mockResolvedValueOnce({
      id: accreditationId,
      status: 'created'
    })

    const response = await server.inject({
      method: 'GET',
      url,
      ...asOperator()
    })

    expect(response.statusCode).toBe(StatusCodes.INTERNAL_SERVER_ERROR)
  })
})
