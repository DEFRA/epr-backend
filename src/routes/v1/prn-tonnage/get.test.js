import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { getPrnTonnage, prnTonnagePath } from './get.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { aggregatePrnTonnage } from '#application/prn-tonnage/aggregate-prn-tonnage.js'

vi.mock('#application/prn-tonnage/aggregate-prn-tonnage.js', () => ({
  aggregatePrnTonnage: vi.fn()
}))

describe('getPrnTonnage route handler', () => {
  const mockDb = {}
  const mockLogger = {
    info: vi.fn(),
    error: vi.fn()
  }

  const mockCode = vi.fn()
  const mockResponse = vi.fn(() => ({
    code: mockCode
  }))

  const mockH = {
    response: mockResponse
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 200 and logs success when aggregation succeeds', async () => {
    const payload = {
      generatedAt: '2026-02-23T15:00:00.000Z',
      rows: []
    }
    vi.mocked(aggregatePrnTonnage).mockResolvedValue(payload)

    await getPrnTonnage.handler({ db: mockDb, logger: mockLogger }, mockH)

    expect(aggregatePrnTonnage).toHaveBeenCalledWith(mockDb)
    expect(mockLogger.info).toHaveBeenCalledWith({
      message: 'PRN tonnage data retrieved successfully',
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.REQUEST_SUCCESS
      }
    })
    expect(mockResponse).toHaveBeenCalledWith(payload)
    expect(mockCode).toHaveBeenCalledWith(StatusCodes.OK)
    expect(mockLogger.error).not.toHaveBeenCalled()
  })

  it('logs error and throws badImplementation when aggregation fails', async () => {
    const error = new Error('aggregation failed')
    vi.mocked(aggregatePrnTonnage).mockRejectedValue(error)

    await expect(
      getPrnTonnage.handler({ db: mockDb, logger: mockLogger }, mockH)
    ).rejects.toMatchObject({
      isBoom: true,
      output: {
        statusCode: StatusCodes.INTERNAL_SERVER_ERROR
      },
      message: `Failure on ${prnTonnagePath}`
    })

    expect(mockLogger.error).toHaveBeenCalledWith({
      err: error,
      message: `Failure on ${prnTonnagePath}`,
      event: {
        category: LOGGING_EVENT_CATEGORIES.SERVER,
        action: LOGGING_EVENT_ACTIONS.RESPONSE_FAILURE
      },
      http: {
        response: {
          status_code: StatusCodes.INTERNAL_SERVER_ERROR
        }
      }
    })
  })
})
