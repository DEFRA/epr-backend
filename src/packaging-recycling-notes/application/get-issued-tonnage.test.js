import { describe, expect, it, vi } from 'vitest'
import { PRN_STATUS } from '../domain/model.js'
import { getIssuedTonnage } from './get-issued-tonnage.js'

const PERIOD_START = '2025-01-01'
const PERIOD_END = '2025-12-31'
const IN_PERIOD = new Date('2025-06-15T12:00:00Z')

/**
 * @param {string} id
 * @param {number} tonnage
 * @param {import('../domain/model.js').PrnStatus} status
 * @returns {import('../domain/model.js').PackagingRecyclingNote}
 */
function buildPrn(id, tonnage, status) {
  return /** @type {import('../domain/model.js').PackagingRecyclingNote} */ ({
    id,
    tonnage,
    status: {
      currentStatus: status,
      currentStatusAt: IN_PERIOD,
      history: [{ status, at: IN_PERIOD, by: { id: 'u', name: 'U' } }]
    }
  })
}

describe('getIssuedTonnage', () => {
  const accreditationId = 'acc-123'
  const defaultParams = {
    accreditationId,
    startDate: PERIOD_START,
    endDate: PERIOD_END,
    statuses: [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.ACCEPTED]
  }

  it('returns undefined when accreditationId is absent', async () => {
    const findByAccreditation = vi.fn()

    const result = await getIssuedTonnage(
      { findByAccreditation },
      { ...defaultParams, accreditationId: undefined }
    )

    expect(findByAccreditation).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('returns undefined when accreditationId is null', async () => {
    const findByAccreditation = vi.fn()

    const result = await getIssuedTonnage(
      { findByAccreditation },
      { ...defaultParams, accreditationId: null }
    )

    expect(findByAccreditation).not.toHaveBeenCalled()
    expect(result).toBeUndefined()
  })

  it('returns issuedTonnage for qualifying PRNs', async () => {
    const findByAccreditation = vi
      .fn()
      .mockResolvedValue([
        buildPrn('prn-1', 30, PRN_STATUS.AWAITING_ACCEPTANCE),
        buildPrn('prn-2', 20, PRN_STATUS.ACCEPTED)
      ])

    const result = await getIssuedTonnage(
      { findByAccreditation },
      defaultParams
    )

    expect(findByAccreditation).toHaveBeenCalledWith(accreditationId)
    expect(result).toEqual({ issuedTonnage: 50 })
  })

  it('returns issuedTonnage of 0 when no PRNs found', async () => {
    const findByAccreditation = vi.fn().mockResolvedValue([])

    const result = await getIssuedTonnage(
      { findByAccreditation },
      defaultParams
    )

    expect(result).toEqual({ issuedTonnage: 0 })
  })

  it('excludes PRNs with non-qualifying statuses', async () => {
    const findByAccreditation = vi
      .fn()
      .mockResolvedValue([
        buildPrn('prn-1', 100, PRN_STATUS.AWAITING_CANCELLATION)
      ])

    const result = await getIssuedTonnage(
      { findByAccreditation },
      defaultParams
    )

    expect(result).toEqual({ issuedTonnage: 0 })
  })

  it('includes a PRN with a status event exactly at end of day on endDate', async () => {
    const atEndOfDay = new Date('2025-12-31T23:59:59.999Z')
    const prn =
      /** @type {import('../domain/model.js').PackagingRecyclingNote} */ ({
        id: 'prn-boundary',
        tonnage: 10,
        status: {
          currentStatus: PRN_STATUS.ACCEPTED,
          currentStatusAt: atEndOfDay,
          history: [
            {
              status: PRN_STATUS.ACCEPTED,
              at: atEndOfDay,
              by: { id: 'u', name: 'U' }
            }
          ]
        }
      })
    const findByAccreditation = vi.fn().mockResolvedValue([prn])

    const result = await getIssuedTonnage(
      { findByAccreditation },
      defaultParams
    )

    expect(result).toEqual({ issuedTonnage: 10 })
  })
})
