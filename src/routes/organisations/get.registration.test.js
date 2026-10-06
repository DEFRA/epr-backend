import { StatusCodes } from 'http-status-codes'

import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  EXPORTER_NUMBER,
  REPROCESSOR_NUMBER,
  approvedSiteView,
  body,
  buildAccreditedOrganisation,
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

    expect(Object.keys(body(response).registrations)).toEqual([
      REPROCESSOR_NUMBER,
      EXPORTER_NUMBER
    ])
  })

  it('returns one registration by its number', async () => {
    const response = await get(`${registrations}/${EXPORTER_NUMBER}`)

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(body(response)).toMatchObject({
      wasteProcessingType: 'exporter',
      overseasSites: { '001': approvedSiteView }
    })
  })

  it('returns 404 for an unknown registration', async () => {
    const response = await get(`${registrations}/R26XX0000000000PL`)

    expect(response.statusCode).toBe(StatusCodes.NOT_FOUND)
  })
})
