import { createHmac } from 'node:crypto'
import { tracing } from '@defra/hapi-tracing'
import Hapi from '@hapi/hapi'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { toYear } from '#common/helpers/dates/year.js'
import { getTracingHeaderName } from '#common/helpers/request-tracing.js'
import { toOrganisationNumber } from '#domain/organisations/numbers.js'
import { setupMsw } from '#vite/setup-msw.js'

import {
  createRegAccredAccreditationsLoader,
  signedHeaders
} from './reg-accred-accreditations.js'

const config = {
  baseUrl: 'https://reg-accred.test',
  clientId: 'epr-ReEx-Client',
  sharedSecret: 'secret'
}

const ACCREDITATIONS_URL = `${config.baseUrl}/v1/accreditations`

const mswServer = setupMsw()

/**
 * The CDP v3 signature for the given headers, as Reg Accred checks it.
 *
 * @param {{ get: (name: string) => string | null }} headers
 */
const expectedSignature = (headers) =>
  createHmac('sha256', config.sharedSecret)
    .update(
      [
        'v3',
        headers.get('x-cdp-client-id'),
        '',
        '',
        headers.get('x-cdp-auth-timestamp'),
        headers.get('x-cdp-auth-nonce')
      ].join('\n')
    )
    .digest('base64')

/** The query of the first page of a search for 2027 accreditations. */
const firstPage = { year: '2027', pageNumber: '1', limit: '100' }

/**
 * Serves `GET /v1/accreditations` with `items` on one page, recording each
 * request.
 *
 * @param {object[]} [items]
 * @param {{ totalItems?: number }} [page]
 * @returns {Request[]} the requests received
 */
const serveAccreditations = (
  items = [],
  { totalItems = items.length } = {}
) => {
  /** @type {Request[]} */
  const received = []
  mswServer.use(
    http.get(ACCREDITATIONS_URL, ({ request }) => {
      received.push(request)
      return HttpResponse.json({ pageNumber: 1, limit: 100, totalItems, items })
    })
  )
  return received
}

/** @param {number} index */
const accreditationNumberAt = (index) =>
  `A27ER99000${String(index).padStart(3, '0')}0000PA`

/**
 * Serves `GET /v1/accreditations` with `total` reprocessor accreditations,
 * paged by the `pageNumber` and `limit` asked for, recording each request.
 *
 * @param {number} total
 * @returns {Request[]} the requests received
 */
const servePagedAccreditations = (total) => {
  /** @type {Request[]} */
  const received = []
  mswServer.use(
    http.get(ACCREDITATIONS_URL, ({ request }) => {
      received.push(request)
      const { searchParams } = new URL(request.url)
      const pageNumber = Number(searchParams.get('pageNumber'))
      const limit = Number(searchParams.get('limit'))
      const first = (pageNumber - 1) * limit
      return HttpResponse.json({
        pageNumber,
        limit,
        totalItems: total,
        items: Array.from(
          { length: Math.max(0, Math.min(limit, total - first)) },
          (_, offset) => ({
            organisationNumber: 990001,
            registrationNumber: 'R26ER9900010000PA',
            accreditationNumber: accreditationNumberAt(first + offset),
            accreditationYear: 2027,
            material: 'Paper',
            wasteProcessingType: 'reprocessor',
            status: 'approved',
            tonnageBand: 'up_to_500'
          })
        )
      })
    })
  )
  return received
}

/**
 * Loads 2027 accreditations.
 *
 * @param {string} [organisationNumber]
 * @param {() => Date} [now]
 */
const loadFor = (organisationNumber, now) =>
  createRegAccredAccreditationsLoader(config, now)(
    toYear(2027),
    organisationNumber === undefined
      ? undefined
      : toOrganisationNumber(organisationNumber)
  )

describe('signedHeaders', () => {
  it('signs the client id, timestamp and nonce with the shared secret', () => {
    const headers = signedHeaders(
      config,
      () => new Date('2027-01-02T03:04:05.678Z')
    )

    expect(headers['x-cdp-auth-timestamp']).toBe('2027-01-02T03:04:05Z')
    expect(headers['x-cdp-auth-signature']).toBe(
      expectedSignature(new Headers(headers))
    )
  })
})

describe('createRegAccredAccreditationsLoader', () => {
  it("serves an organisation's 2027 accreditations from Reg Accred as external accreditations", async () => {
    serveAccreditations([
      {
        organisationNumber: 990001,
        registrationNumber: 'R26EX9900010002PA',
        accreditationNumber: 'A27EX9900010002PA',
        accreditationYear: 2027,
        material: 'Paper',
        wasteProcessingType: 'exporter',
        status: 'approved',
        tonnageBand: 'up_to_5000'
      }
    ])

    const accreditations = await loadFor(
      '990001',
      () => new Date('2027-03-10T09:15:00Z')
    )

    expect(accreditations).toStrictEqual([
      {
        organisationNumber: '990001',
        registrationNumber: 'R26EX9900010002PA',
        year: 2027,
        accreditationNumber: 'A27EX9900010002PA',
        prnIssuance: { tonnageBand: 'up_to_5000' },
        status: {
          current: 'approved',
          lastUpdatedAt: '2027-03-10T09:15:00.000Z',
          timeline: [{ status: 'approved', at: '2027-01-01T00:00:00.000Z' }]
        },
        overseasSites: {}
      }
    ])
  })

  it("lists no overseas sites on a reprocessor's accreditation", async () => {
    serveAccreditations([
      {
        organisationNumber: 990001,
        registrationNumber: 'R26ER9900010001PA',
        accreditationNumber: 'A27ER9900010001PA',
        accreditationYear: 2027,
        material: 'Paper',
        wasteProcessingType: 'reprocessor',
        status: 'approved',
        tonnageBand: 'up_to_5000'
      }
    ])

    const [accreditation] = await loadFor('990001')

    expect(accreditation).not.toHaveProperty('overseasSites')
  })

  it("asks for the organisation's 2027 accreditations", async () => {
    const received = serveAccreditations()

    await loadFor('990001')

    expect(
      received.map(({ url }) => Object.fromEntries(new URL(url).searchParams))
    ).toStrictEqual([{ ...firstPage, organisationNumber: '990001' }])
  })

  it("asks for every organisation's 2027 accreditations in one search when given no organisations", async () => {
    const received = serveAccreditations()

    await loadFor()

    expect(
      received.map(({ url }) => Object.fromEntries(new URL(url).searchParams))
    ).toStrictEqual([firstPage])
  })

  it.for([
    { description: "an organisation's", organisationNumber: '990001' },
    { description: "every organisation's", organisationNumber: undefined }
  ])(
    'reads every page of $description accreditations, 100 at a time',
    async ({ organisationNumber }) => {
      const received = servePagedAccreditations(250)

      const accreditations = await loadFor(organisationNumber)

      expect(
        accreditations.map(({ accreditationNumber }) => accreditationNumber)
      ).toStrictEqual(
        Array.from({ length: 250 }, (_, index) => accreditationNumberAt(index))
      )
      expect(
        received.map(({ url }) => {
          const { pageNumber, limit } = Object.fromEntries(
            new URL(url).searchParams
          )
          return { pageNumber, limit }
        })
      ).toStrictEqual([
        { pageNumber: '1', limit: '100' },
        { pageNumber: '2', limit: '100' },
        { pageNumber: '3', limit: '100' }
      ])
    }
  )

  it('stops at an empty page, even short of the total it was told of', async () => {
    const received = serveAccreditations([], { totalItems: 5 })

    const accreditations = await loadFor('990001')

    expect(accreditations).toStrictEqual([])
    expect(received).toHaveLength(1)
  })

  it('signs each request with the shared secret', async () => {
    const received = serveAccreditations()

    await loadFor('990001')

    const [{ headers }] = received
    expect(headers.get('x-cdp-client-id')).toBe('epr-ReEx-Client')
    expect(headers.get('x-cdp-auth-signature')).toBe(expectedSignature(headers))
    expect(headers.has('x-api-key')).toBe(false)
  })

  it('sends the trace id of the request it serves', async () => {
    const received = serveAccreditations()
    const tracingHeader = getTracingHeaderName()
    const server = Hapi.server()
    await server.register({
      plugin: tracing.plugin,
      options: { tracingHeader }
    })
    server.route({
      method: 'GET',
      path: '/',
      handler: async () => loadFor('990001')
    })

    await server.inject({
      method: 'GET',
      url: '/',
      headers: { [tracingHeader]: 'trace-abc-123' }
    })

    expect(received[0].headers.get(tracingHeader)).toBe('trace-abc-123')
  })

  it('fails when Reg Accred does', async () => {
    mswServer.use(
      http.get(ACCREDITATIONS_URL, () =>
        HttpResponse.json({ message: 'unavailable' }, { status: 503 })
      )
    )

    await expect(loadFor('990001')).rejects.toMatchObject({
      output: { statusCode: 503 }
    })
  })
})
