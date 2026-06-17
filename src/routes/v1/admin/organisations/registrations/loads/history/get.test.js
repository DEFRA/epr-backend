import { describe, it, expect, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'

import { ROW_OUTCOME } from '#domain/summary-logs/table-schemas/validation-pipeline.js'
import { WASTE_RECORD_TYPE } from '#domain/waste-records/model.js'
import { buildStreamEvent } from '#waste-balances/repository/stream-test-data.js'
import { buildRowStateEntry } from '#waste-balances/repository/row-states-test-data.js'
import { createTestServer } from '#test/create-test-server.js'
import { asServiceMaintainer } from '#test/inject-auth.js'
import { setupAuthContext } from '#vite/helpers/setup-auth-mocking.js'
import {
  rowHistoryByRegistrationGetPath,
  rowHistoryByAccreditationGetPath
} from './get.js'

const ORGANISATION_ID = 'org-1'
const REGISTRATION_ID = 'reg-1'
const ACCREDITATION_ID = 'acc-1'

const registrationPath = ({
  organisationId = ORGANISATION_ID,
  registrationId = REGISTRATION_ID,
  wasteRecordType = WASTE_RECORD_TYPE.RECEIVED,
  rowId = 'row-1'
} = {}) =>
  rowHistoryByRegistrationGetPath
    .replace('{organisationId}', organisationId)
    .replace('{registrationId}', registrationId)
    .replace('{wasteRecordType}', wasteRecordType)
    .replace('{rowId}', rowId)

const accreditationPath = ({
  organisationId = ORGANISATION_ID,
  registrationId = REGISTRATION_ID,
  accreditationId = ACCREDITATION_ID,
  wasteRecordType = WASTE_RECORD_TYPE.RECEIVED,
  rowId = 'row-1'
} = {}) =>
  rowHistoryByAccreditationGetPath
    .replace('{organisationId}', organisationId)
    .replace('{registrationId}', registrationId)
    .replace('{accreditationId}', accreditationId)
    .replace('{wasteRecordType}', wasteRecordType)
    .replace('{rowId}', rowId)

describe('admin row-state drill-down history', () => {
  setupAuthContext()

  let server
  let rowStateRepository
  let streamRepository

  beforeEach(async () => {
    server = await createTestServer()
    rowStateRepository = server.app.rowStateRepository
    streamRepository = server.app.streamRepository
  })

  const submit = async (number, summaryLogId, creditTotal, accreditationId) => {
    await streamRepository.appendEvent(
      buildStreamEvent({
        number,
        accreditationId,
        payload: { summaryLogId, creditTotal }
      })
    )
  }

  it('returns the registration-only history in stream order with each contribution', async () => {
    await submit(1, 'log-1', 10, null)
    await submit(2, 'log-2', 99, null)

    await rowStateRepository.upsertRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId: null
      },
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-1'
    )
    await rowStateRepository.upsertRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId: null
      },
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
      url: registrationPath(),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([
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

  it('scopes the accreditation route to its accreditation and the registration route to the registered-only rows', async () => {
    await submit(1, 'log-acc', 10, ACCREDITATION_ID)
    await submit(1, 'log-reg', 20, null)

    await rowStateRepository.upsertRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId: ACCREDITATION_ID
      },
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 10 } })],
      'log-acc'
    )
    await rowStateRepository.upsertRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId: null
      },
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 20 } })],
      'log-reg'
    )

    const accredited = await server.inject({
      method: 'GET',
      url: accreditationPath(),
      ...asServiceMaintainer()
    })
    const registeredOnly = await server.inject({
      method: 'GET',
      url: registrationPath(),
      ...asServiceMaintainer()
    })

    expect(accredited.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(accredited.payload).map((e) => e.data.tonnage)).toEqual([
      10
    ])
    expect(registeredOnly.statusCode).toBe(StatusCodes.OK)
    expect(
      JSON.parse(registeredOnly.payload).map((e) => e.data.tonnage)
    ).toEqual([20])
  })

  it('returns empty history for an accreditation that has no rows of that identity', async () => {
    await submit(1, 'log-reg', 20, null)
    await rowStateRepository.upsertRowStates(
      {
        organisationId: ORGANISATION_ID,
        registrationId: REGISTRATION_ID,
        accreditationId: null
      },
      [buildRowStateEntry({ rowId: 'row-1', data: { tonnage: 20 } })],
      'log-reg'
    )

    const response = await server.inject({
      method: 'GET',
      url: accreditationPath({ accreditationId: 'acc-other' }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })

  it('returns an empty array when the registration row has no committed history', async () => {
    const response = await server.inject({
      method: 'GET',
      url: registrationPath({ rowId: 'row-absent' }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.OK)
    expect(JSON.parse(response.payload)).toEqual([])
  })

  it('rejects an unknown waste record type on the registration route', async () => {
    const response = await server.inject({
      method: 'GET',
      url: registrationPath({ wasteRecordType: 'nonsense' }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('rejects an unknown waste record type on the accreditation route', async () => {
    const response = await server.inject({
      method: 'GET',
      url: accreditationPath({ wasteRecordType: 'nonsense' }),
      ...asServiceMaintainer()
    })

    expect(response.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY)
  })

  it('returns 401 when not authenticated', async () => {
    const response = await server.inject({
      method: 'GET',
      url: accreditationPath()
    })

    expect(response.statusCode).toBe(StatusCodes.UNAUTHORIZED)
  })
})
