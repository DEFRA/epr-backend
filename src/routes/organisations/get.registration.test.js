import { StatusCodes } from 'http-status-codes'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  body,
  buildAccreditedOrganisation,
  exporterResponse,
  reprocessorResponse,
  useViewServer
} from './organisation-view-test-helpers.js'

describe('GET /organisations/{organisationNumber}/registrations', () => {
  setupAuthContext()

  const { serve, get } = useViewServer()

  const organisation = buildAccreditedOrganisation()
  const registrations = `/organisations/${organisation.orgId}/registrations`

  beforeEach(async () => {
    await serve(organisation)
  })

  it('lists the granted registrations keyed by number', async () => {
    const response = await get(registrations)

    expect(body(response)).toEqual({
      registrations: {
        [REPROCESSOR_NUMBER]: reprocessorResponse,
        [EXPORTER_NUMBER]: exporterResponse
      }
    })
  })

  it('returns one registration by its number', async () => {
    const response = await get(`${registrations}/${EXPORTER_NUMBER}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toEqual(exporterResponse)
  })

  it('returns 404 for an unknown registration', async () => {
    const response = await get(`${registrations}/R26XX0000000000PL`)

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
