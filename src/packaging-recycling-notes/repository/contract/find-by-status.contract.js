import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import {
  buildAwaitingAcceptancePrn,
  buildCancelledPrn,
  buildDraftPrn
} from './test-data.js'

const ONE_HOUR_MS = 3600000
const TWO_HOURS_MS = 7200000
const DEFAULT_LIMIT = 200

/**
 * Returns a unique far-future timestamp for test isolation.
 * Each call advances by 1 day so tests within the same run don't collide.
 */
let dateCounter = 0
function uniqueFutureDate() {
  const dayMs = 86400000
  dateCounter++
  return new Date('2030-01-01T12:00:00Z').getTime() + dateCounter * dayMs
}

function buildAwaitingAcceptanceAtDate(issuedAt) {
  return buildAwaitingAcceptancePrn({
    prnNumber: `FBS-AA-${Date.now()}-${Math.random()}`,
    status: {
      currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
      currentStatusAt: issuedAt,
      created: {
        at: new Date(issuedAt.getTime() - TWO_HOURS_MS),
        by: { id: 'raiser', name: 'Raiser' }
      },
      issued: {
        at: issuedAt,
        by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date(issuedAt.getTime() - TWO_HOURS_MS),
          by: { id: 'creator', name: 'Creator' }
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: new Date(issuedAt.getTime() - ONE_HOUR_MS),
          by: { id: 'raiser', name: 'Raiser' }
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: issuedAt,
          by: { id: 'issuer', name: 'Issuer' }
        }
      ]
    }
  })
}

function buildCancelledAtDate(cancelledAt) {
  const issuedAt = new Date(cancelledAt.getTime() - TWO_HOURS_MS)
  return buildCancelledPrn({
    prnNumber: `FBS-CA-${Date.now()}-${Math.random()}`,
    status: {
      currentStatus: PRN_STATUS.CANCELLED,
      currentStatusAt: cancelledAt,
      created: {
        at: new Date(issuedAt.getTime() - ONE_HOUR_MS),
        by: { id: 'raiser', name: 'Raiser' }
      },
      issued: {
        at: issuedAt,
        by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
      },
      rejected: {
        at: new Date(cancelledAt.getTime() - ONE_HOUR_MS),
        by: { id: 'rpd', name: 'RPD' }
      },
      cancelled: {
        at: cancelledAt,
        by: { id: 'canceller', name: 'Canceller' }
      },
      history: [
        {
          status: PRN_STATUS.DRAFT,
          at: new Date(issuedAt.getTime() - TWO_HOURS_MS),
          by: { id: 'creator', name: 'Creator' }
        },
        {
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at: new Date(issuedAt.getTime() - ONE_HOUR_MS),
          by: { id: 'raiser', name: 'Raiser' }
        },
        {
          status: PRN_STATUS.AWAITING_ACCEPTANCE,
          at: issuedAt,
          by: { id: 'issuer', name: 'Issuer' }
        },
        {
          status: PRN_STATUS.AWAITING_CANCELLATION,
          at: new Date(cancelledAt.getTime() - ONE_HOUR_MS),
          by: { id: 'rpd', name: 'RPD' }
        },
        {
          status: PRN_STATUS.CANCELLED,
          at: cancelledAt,
          by: { id: 'canceller', name: 'Canceller' }
        }
      ]
    }
  })
}

function itemIds(result) {
  return result.items.map((p) => p.id)
}

// All assertions use presence/absence of known IDs rather than exact counts.
// This makes tests robust in shared MongoDB collections where data accumulates
// across tests within a file and across repeated runs.
// Pagination tests use cursor-based isolation: ObjectIds are monotonic, so
// a cursor from a freshly-created item naturally excludes all older data.
export const testFindByStatusBehaviour = (it) => {
  describe('findByStatus', () => {
    let repository

    beforeEach(async ({ prnRepository }) => {
      repository = prnRepository
    })

    describe('status filtering', () => {
      it('returns empty result when no PRNs match status', async () => {
        await repository.create(buildDraftPrn())

        // ACCEPTED is never created by any contract test
        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.ACCEPTED],
          limit: DEFAULT_LIMIT
        })

        expect(result.items).toEqual([])
        expect(result.hasMore).toBe(false)
        expect(result.nextCursor).toBeNull()
      })

      it('returns PRNs matching a single status', async () => {
        const created = await repository.create(
          buildCancelledPrn({ prnNumber: `FBS-C-${Date.now()}` })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          limit: DEFAULT_LIMIT
        })

        const ids = itemIds(result)
        expect(ids).toContain(created.id)
      })

      it('returns PRNs matching multiple statuses', async () => {
        const baseTime = uniqueFutureDate()
        const issuedAt = new Date(baseTime)
        const cancelledAt = new Date(baseTime + ONE_HOUR_MS)

        const awaitingPrn = await repository.create(
          buildAwaitingAcceptanceAtDate(issuedAt)
        )
        const cancelledPrn = await repository.create(
          buildCancelledAtDate(cancelledAt)
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE, PRN_STATUS.CANCELLED],
          dateFrom: new Date(baseTime - ONE_HOUR_MS),
          dateTo: new Date(baseTime + TWO_HOURS_MS),
          limit: DEFAULT_LIMIT
        })

        const ids = itemIds(result)
        expect(ids).toContain(awaitingPrn.id)
        expect(ids).toContain(cancelledPrn.id)
      })

      it('does not return PRNs in non-matching statuses', async () => {
        await repository.create(buildDraftPrn())

        // ACCEPTED is never created by any contract test
        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.ACCEPTED],
          limit: DEFAULT_LIMIT
        })

        expect(result.items).toEqual([])
      })
    })

    describe('date range filtering', () => {
      it('filters by dateFrom using the current status history entry', async () => {
        const baseTime = uniqueFutureDate()
        const issuedAt = new Date(baseTime)
        const created = await repository.create(
          buildAwaitingAcceptanceAtDate(issuedAt)
        )
        const createdId = created.id

        const afterIssue = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateFrom: new Date(baseTime - ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(afterIssue)).toContain(createdId)

        const exactlyAtIssue = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateFrom: issuedAt,
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(exactlyAtIssue)).toContain(createdId)

        const tooLate = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateFrom: new Date(baseTime + ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(tooLate)).not.toContain(createdId)
      })

      it('filters by dateTo using the current status history entry', async () => {
        const baseTime = uniqueFutureDate()
        const issuedAt = new Date(baseTime)
        const created = await repository.create(
          buildAwaitingAcceptanceAtDate(issuedAt)
        )
        const createdId = created.id

        const dateToOnly = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateTo: new Date(baseTime + ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(dateToOnly)).toContain(createdId)

        const exactlyAtIssue = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateFrom: new Date(baseTime - ONE_HOUR_MS),
          dateTo: issuedAt,
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(exactlyAtIssue)).toContain(createdId)

        const tooEarly = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          dateFrom: new Date(baseTime - TWO_HOURS_MS),
          dateTo: new Date(baseTime - ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(tooEarly)).not.toContain(createdId)
      })

      it('uses the correct history entry for cancelled PRNs, not awaiting_acceptance', async () => {
        const baseTime = uniqueFutureDate()
        const issuedAt = new Date(baseTime)
        const cancelledAt = new Date(baseTime + 10 * ONE_HOUR_MS)

        const created = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-CC-${Date.now()}-${Math.random()}`,
            status: {
              currentStatus: PRN_STATUS.CANCELLED,
              currentStatusAt: cancelledAt,
              created: {
                at: new Date(issuedAt.getTime() - ONE_HOUR_MS),
                by: { id: 'raiser', name: 'Raiser' }
              },
              issued: {
                at: issuedAt,
                by: { id: 'issuer', name: 'Issuer', position: 'Manager' }
              },
              rejected: {
                at: new Date(cancelledAt.getTime() - ONE_HOUR_MS),
                by: { id: 'rpd', name: 'RPD' }
              },
              cancelled: {
                at: cancelledAt,
                by: { id: 'canceller', name: 'Canceller' }
              },
              history: [
                {
                  status: PRN_STATUS.DRAFT,
                  at: new Date(issuedAt.getTime() - TWO_HOURS_MS),
                  by: { id: 'creator', name: 'Creator' }
                },
                {
                  status: PRN_STATUS.AWAITING_AUTHORISATION,
                  at: new Date(issuedAt.getTime() - ONE_HOUR_MS),
                  by: { id: 'raiser', name: 'Raiser' }
                },
                {
                  status: PRN_STATUS.AWAITING_ACCEPTANCE,
                  at: issuedAt,
                  by: { id: 'issuer', name: 'Issuer' }
                },
                {
                  status: PRN_STATUS.AWAITING_CANCELLATION,
                  at: new Date(cancelledAt.getTime() - ONE_HOUR_MS),
                  by: { id: 'rpd', name: 'RPD' }
                },
                {
                  status: PRN_STATUS.CANCELLED,
                  at: cancelledAt,
                  by: { id: 'canceller', name: 'Canceller' }
                }
              ]
            }
          })
        )
        const createdId = created.id

        // Date range covers the cancellation date — should match
        const matchesCancellation = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          dateFrom: new Date(cancelledAt.getTime() - ONE_HOUR_MS),
          dateTo: new Date(cancelledAt.getTime() + ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(matchesCancellation)).toContain(createdId)

        // Date range only covers the awaiting_acceptance date — should NOT match
        const onlyCoversIssued = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          dateFrom: new Date(issuedAt.getTime() - ONE_HOUR_MS),
          dateTo: new Date(issuedAt.getTime() + ONE_HOUR_MS),
          limit: DEFAULT_LIMIT
        })
        expect(itemIds(onlyCoversIssued)).not.toContain(createdId)
      })
    })

    // Pagination tests use cursor from a freshly-created item.
    // ObjectIds are monotonic, so the cursor naturally excludes all
    // older data from earlier tests and previous runs.
    describe('pagination', () => {
      it('returns items sorted by id ascending', async () => {
        const prn1 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-S1-${Date.now()}-${Math.random()}`
          })
        )
        const prn2 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-S2-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          limit: DEFAULT_LIMIT
        })

        const ids = itemIds(result)
        expect(ids.indexOf(prn1.id)).toBeLessThan(ids.indexOf(prn2.id))
      })

      it('respects limit parameter', async () => {
        // Create a sentinel, then items after it
        const sentinel = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-LS-${Date.now()}-${Math.random()}`
          })
        )
        await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-L1-${Date.now()}-${Math.random()}`
          })
        )
        await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-L2-${Date.now()}-${Math.random()}`
          })
        )
        await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-L3-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: 2
        })

        expect(result.items).toHaveLength(2)
      })

      it('returns hasMore true when more items exist beyond limit', async () => {
        const sentinel = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-HMS-${Date.now()}-${Math.random()}`
          })
        )
        await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-HM1-${Date.now()}-${Math.random()}`
          })
        )
        await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-HM2-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: 1
        })

        expect(result.items).toHaveLength(1)
        expect(result.hasMore).toBe(true)
        expect(result.nextCursor).toBe(result.items[0].id)
      })

      it('returns hasMore false and null cursor when no more items', async () => {
        const prn = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-NM-${Date.now()}-${Math.random()}`
          })
        )

        // Cursor from the last item we created — nothing after it
        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: prn.id,
          limit: 100
        })

        expect(result.hasMore).toBe(false)
        expect(result.nextCursor).toBeNull()
      })

      it('returns items after cursor when cursor is provided', async () => {
        const sentinel = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-C0-${Date.now()}-${Math.random()}`
          })
        )
        const prn1 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-C1-${Date.now()}-${Math.random()}`
          })
        )
        const prn2 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-C2-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: DEFAULT_LIMIT
        })

        const ids = itemIds(result)
        expect(ids).toContain(prn1.id)
        expect(ids).toContain(prn2.id)
        expect(ids).not.toContain(sentinel.id)
      })

      it('paginates through all results with cursor and limit', async () => {
        const sentinel = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-PS-${Date.now()}-${Math.random()}`
          })
        )
        const prn1 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-P1-${Date.now()}-${Math.random()}`
          })
        )
        const prn2 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-P2-${Date.now()}-${Math.random()}`
          })
        )
        const prn3 = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-P3-${Date.now()}-${Math.random()}`
          })
        )

        // Page 1: from sentinel with limit 2
        const page1 = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: 2
        })
        expect(page1.items).toHaveLength(2)
        expect(page1.items[0].id).toBe(prn1.id)
        expect(page1.items[1].id).toBe(prn2.id)
        expect(page1.hasMore).toBe(true)

        // Page 2: from page1 cursor
        const page2 = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: page1.nextCursor,
          limit: 2
        })
        expect(page2.items).toHaveLength(1)
        expect(page2.items[0].id).toBe(prn3.id)
        expect(page2.hasMore).toBe(false)
        expect(page2.nextCursor).toBeNull()
      })

      it('does not leak _id in returned items', async () => {
        const created = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-NID-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          limit: DEFAULT_LIMIT
        })

        const match = result.items.find((p) => p.id === created.id)
        expect(match).toBeDefined()
        expect(match._id).toBeUndefined()
      })

      it('returns items with ids populated as strings', async () => {
        const created = await repository.create(
          buildCancelledPrn({
            prnNumber: `FBS-ID-${Date.now()}-${Math.random()}`
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          limit: DEFAULT_LIMIT
        })

        const match = result.items.find((p) => p.id === created.id)
        expect(match).toBeDefined()
        expect(typeof match.id).toBe('string')
      })
    })

    describe('exclusion filtering', () => {
      it('excludes PRNs belonging to excluded organisation IDs', async () => {
        const excludedOrgId = randomUUID()
        const includedOrgId = randomUUID()

        const excludedPrn = await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: excludedOrgId, name: 'Excluded Org' }
          })
        )

        const includedPrn = await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: includedOrgId, name: 'Included Org' }
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          limit: DEFAULT_LIMIT,
          excludeOrganisationIds: [excludedOrgId]
        })

        const ids = itemIds(result)
        expect(ids).toContain(includedPrn.id)
        expect(ids).not.toContain(excludedPrn.id)
      })

      it('excludes PRNs from multiple excluded organisations', async () => {
        const excludedOrgId1 = randomUUID()
        const excludedOrgId2 = randomUUID()
        const includedOrgId = randomUUID()

        await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: excludedOrgId1, name: 'Excluded Org 1' }
          })
        )

        await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: excludedOrgId2, name: 'Excluded Org 2' }
          })
        )

        const includedPrn = await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: includedOrgId, name: 'Included Org' }
          })
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          limit: DEFAULT_LIMIT,
          excludeOrganisationIds: [excludedOrgId1, excludedOrgId2]
        })

        const ids = itemIds(result)
        expect(ids).toContain(includedPrn.id)
      })

      it('excludes specific PRN IDs', async () => {
        const excludedPrn = await repository.create(
          buildAwaitingAcceptancePrn()
        )

        const includedPrn = await repository.create(
          buildAwaitingAcceptancePrn()
        )

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          limit: DEFAULT_LIMIT,
          excludePrnIds: [excludedPrn.id]
        })

        const ids = itemIds(result)
        expect(ids).toContain(includedPrn.id)
        expect(ids).not.toContain(excludedPrn.id)
      })

      it('excludes by both organisation ID and PRN ID simultaneously', async () => {
        const excludedOrgId = randomUUID()

        const excludedByOrg = await repository.create(
          buildAwaitingAcceptancePrn({
            organisation: { id: excludedOrgId, name: 'Excluded Org' }
          })
        )

        const excludedById = await repository.create(
          buildAwaitingAcceptancePrn()
        )

        const included = await repository.create(buildAwaitingAcceptancePrn())

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.AWAITING_ACCEPTANCE],
          limit: DEFAULT_LIMIT,
          excludeOrganisationIds: [excludedOrgId],
          excludePrnIds: [excludedById.id]
        })

        const ids = itemIds(result)
        expect(ids).toContain(included.id)
        expect(ids).not.toContain(excludedByOrg.id)
        expect(ids).not.toContain(excludedById.id)
      })

      it('returns unfiltered results when no exclusion params are provided', async () => {
        const prn = await repository.create(buildCancelledPrn())

        const result = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          limit: DEFAULT_LIMIT
        })

        expect(itemIds(result)).toContain(prn.id)
      })

      it('pagination works correctly with exclusions applied', async () => {
        const excludedOrgId = randomUUID()

        const sentinel = await repository.create(buildCancelledPrn())

        // Interleave included and excluded PRNs
        const included1 = await repository.create(buildCancelledPrn())

        await repository.create(
          buildCancelledPrn({
            organisation: { id: excludedOrgId, name: 'Excluded Org' }
          })
        )

        const included2 = await repository.create(buildCancelledPrn())

        await repository.create(
          buildCancelledPrn({
            organisation: { id: excludedOrgId, name: 'Excluded Org' }
          })
        )

        const included3 = await repository.create(buildCancelledPrn())

        // Page 1: limit 2, should get 2 included items
        const page1 = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: 2,
          excludeOrganisationIds: [excludedOrgId]
        })

        expect(page1.items).toHaveLength(2)
        expect(page1.items[0].id).toBe(included1.id)
        expect(page1.items[1].id).toBe(included2.id)
        expect(page1.hasMore).toBe(true)

        // Page 2: should get remaining included item
        const page2 = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: page1.nextCursor,
          limit: 2,
          excludeOrganisationIds: [excludedOrgId]
        })

        expect(page2.items).toHaveLength(1)
        expect(page2.items[0].id).toBe(included3.id)
        expect(page2.hasMore).toBe(false)
      })

      it('pagination works correctly with PRN ID exclusions and cursor combined', async () => {
        const sentinel = await repository.create(buildCancelledPrn())

        const included1 = await repository.create(buildCancelledPrn())

        const excludedById = await repository.create(buildCancelledPrn())

        const included2 = await repository.create(buildCancelledPrn())

        const page1 = await repository.findByStatus({
          statuses: [PRN_STATUS.CANCELLED],
          cursor: sentinel.id,
          limit: 2,
          excludePrnIds: [excludedById.id]
        })

        expect(page1.items).toHaveLength(2)
        expect(page1.items[0].id).toBe(included1.id)
        expect(page1.items[1].id).toBe(included2.id)
        expect(page1.hasMore).toBe(false)
      })
    })
  })
}
