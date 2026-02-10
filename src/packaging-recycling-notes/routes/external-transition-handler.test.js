import { vi, describe, it, expect } from 'vitest'

import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { createMockIssuedPrn } from './test-helpers.js'
import { createExternalTransitionHandler } from './external-transition-handler.js'

describe('createExternalTransitionHandler', () => {
  it('returns 400 when actor is not permitted for the transition', async () => {
    // AWAITING_CANCELLATION → CANCELLED exists but only for SIGNATORY actor.
    // The factory always uses PRODUCER, so this triggers UnauthorisedTransitionError.
    const { handler } = createExternalTransitionHandler({
      newStatus: PRN_STATUS.CANCELLED,
      timestampField: 'cancelledAt',
      actionVerb: 'cancelled',
      path: '/test'
    })

    const awaitingCancellationPrn = createMockIssuedPrn({
      status: {
        currentStatus: PRN_STATUS.AWAITING_CANCELLATION,
        history: [
          {
            status: PRN_STATUS.AWAITING_CANCELLATION,
            updatedAt: new Date()
          }
        ]
      }
    })

    const request = {
      lumpyPackagingRecyclingNotesRepository: {
        findByPrnNumber: vi.fn().mockResolvedValue(awaitingCancellationPrn)
      },
      wasteBalancesRepository: {},
      organisationsRepository: {},
      params: { prnNumber: 'ER2600001' },
      payload: null,
      logger: { info: vi.fn(), error: vi.fn() },
      auth: { credentials: { id: 'rpd', name: 'RPD' } }
    }

    const h = {
      response: vi.fn(() => ({ code: vi.fn() }))
    }

    await expect(handler(request, h)).rejects.toMatchObject({
      isBoom: true,
      output: { statusCode: 400 }
    })
  })
})
