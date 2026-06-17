import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { buildRowStateEntry } from '#waste-balances/repository/row-states-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import { rowHistoryGetPath } from './get.js'

const PARTITION = {
  organisationId: 'org-1',
  registrationId: 'reg-1',
  accreditationId: 'acc-1'
}

/**
 * @param {{ organisationId: string, registrationId: string }} [partition]
 * @param {string} [rowId]
 * @param {string} [type]
 */
const makePath = (
  { organisationId, registrationId } = PARTITION,
  rowId = 'row-1',
  type = WASTE_RECORD_TYPE.RECEIVED
) =>
  `${rowHistoryGetPath
    .replace('{organisationId}', organisationId)
    .replace('{registrationId}', registrationId)
    .replace('{rowId}', rowId)}?type=${type}`

describe(`GET ${rowHistoryGetPath}`, () => {
  setupAuthContext()

  let server
  let rowStateRepository
  let streamRepository

  beforeEach(async () => {
    server = await createTestServer()
    rowStateRepository = server.app.rowStateRepository
    streamRepository = server.app.streamRepository
  })

  it('returns the row history in stream order with each submission’s contribution', async () => {
    await streamRepository.appendEvent(
      buildStreamEvent({
        number: 1,
        payload: { summaryLogId: 'log-1', creditTotal: 10 }
      })
    )
    await streamRepository.appendEvent(
      buildStreamEvent({
        number: 2,
        payload: { summaryLogId: 'log-2', creditTotal: 99 }
      })
    )

    await rowStateRepository.upsertRowStates(
      PARTITION,
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      PARTITION,
      [
        buildRowStateEntry({
          rowId: 'row-1',
          data: { tonnage: 99 },
          classification: {
            outcome: ROW_OUTCOME.EXCLUDED,
            reasons: [{ code: 'OUT_OF_PERIOD', field: 'date' }],
            transactionAmount: 0
          }
        })
      ],
      'log-2'
    )

    const response = await server.inject({
      method: 'GET',
      url: makePath(),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    const result = JSON.parse(response.payload)
    expect(result).toEqual([
      {
        summaryLogId: 'log-1',
        data: { tonnage: 10 },
        outcome: ROW_OUTCOME.INCLUDED,
        reasons: [],
        transactionAmount: 10
      },
      {
        summaryLogId: 'log-2',
        data: { tonnage: 99 },
        outcome: ROW_OUTCOME.EXCLUDED,
        reasons: [{ code: 'OUT_OF_PERIOD', field: 'date' }],
        transactionAmount: 0
      }
    ])
  })

  it('returns an empty array when the row has no committed history', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath(PARTITION, 'row-absent'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })

  it('rejects an unknown waste record type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath(PARTITION, 'row-1', 'nonsense'),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects a request with no waste record type', async () => {
    const response = await server.inject({
      method: 'GET',
      url: `${rowHistoryGetPath
        .replace('{organisationId}', 'org-1')
        .replace('{registrationId}', 'reg-1')
        .replace('{rowId}', 'row-1')}`,
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'GET',
      url: makePath()
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
