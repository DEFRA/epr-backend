import { StatusCodes } from 'http-status-codes'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  body,
  buildAccreditedOrganisation,
  exporterAccreditationResponse,
  reprocessorResponse,
  useViewServer
} from './organisation-view-test-helpers.js'

describe('GET /organisations/{organisationNumber}/registrations/{registrationNumber}/accreditations', () => {
  setupAuthContext()

  const { serve, get } = useViewServer()

  const organisation = buildAccreditedOrganisation()
  const registrations = `/organisations/${organisation.orgId}/registrations`
  const reprocessorPath = `${registrations}/${REPROCESSOR_NUMBER}`
  const exporterPath = `${registrations}/${EXPORTER_NUMBER}`

  beforeEach(async () => {
    await serve(organisation)
  })

  it("returns a registration's accreditations keyed by year", async () => {
    const response = await get(`${reprocessorPath}/accreditations`)

    expect(body(response)).toEqual({
      accreditations: reprocessorResponse.accreditations
    })
  })

  it("returns an exporter's accreditations with their overseas sites", async () => {
    const response = await get(`${exporterPath}/accreditations`)

    expect(body(response)).toEqual({
      accreditations: { 2026: exporterAccreditationResponse }
    })
  })

  it('returns one accreditation by its year, with its overseas sites embedded', async () => {
    const response = await get(`${exporterPath}/accreditations/2026`)

    expect(body(response)).toEqual(exporterAccreditationResponse)
  })

  it('returns one reprocessor accreditation by its year', async () => {
    const response = await get(`${reprocessorPath}/accreditations/2026`)

    expect(body(response)).toEqual(reprocessorResponse.accreditations[2026])
  })

  it.each([
    [
      'an unknown registration',
      `${registrations}/R26XX0000000000PL/accreditations`
    ],
    ['an unknown accreditation year', `${reprocessorPath}/accreditations/2027`]
  ])('returns 404 for %s', async (_, url) => {
    const response = await get(url)

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
