import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StatusCodes } from 'http-status-codes'
import { getPrnTonnage, prnTonnagePath } from './get.js'
import {
  LOGGING_EVENT_ACTIONS,
  LOGGING_EVENT_CATEGORIES
} from '#common/enums/index.js'
import { aggregatePrnTonnage } from '#application/prn-tonnage/aggregate-prn-tonnage.js'
import { createMockPackagingRecyclingNotesRepository } from '#test/mock-repositories.js'
import { createMockLogger } from '#test/mock-logger.js'

/** @import { HapiRequest, HapiResponseToolkit } from '#common/hapi-types.js' */
/** @import { PackagingRecyclingNotesRepository } from '#packaging-recycling-notes/repository/port.js' */

vi.mock(
  '#application/prn-tonnage/aggregate-prn-tonnage.js',
  async (importActual) => ({
    ...(await importActual()),
    aggregatePrnTonnage: vi.fn()
  })
)

describe('getPrnTonnage route handler', () => {
  const packagingRecyclingNotesRepository =
    createMockPackagingRecyclingNotesRepository()
  const mockLogger = createMockLogger()

  const buildRequest = () =>
    /** @type {HapiRequest & { packagingRecyclingNotesRepository: PackagingRecyclingNotesRepository }} */ (
      /** @type {unknown} */ ({
        packagingRecyclingNotesRepository,
        logger: mockLogger
      })
    )

  const mockCode = vi.fn()
  const mockResponse = vi.fn(() => ({
    code: mockCode
  }))

  const mockH = /** @type {HapiResponseToolkit} */ (
    /** @type {unknown} */ ({
      response: mockResponse
    })
  )

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs error and throws badImplementation when aggregation fails', async () => {
    const error = new Error('aggregation failed')
    vi.mocked(aggregatePrnTonnage).mockRejectedValue(error)

    await expect(
      getPrnTonnage.handler(buildRequest(), mockH)
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
