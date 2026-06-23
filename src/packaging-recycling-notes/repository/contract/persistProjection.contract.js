import assert from 'node:assert'
import { describe, beforeEach, expect } from 'vitest'
import { PRN_STATUS } from '#packaging-recycling-notes/domain/model.js'
import { PrnNumberConflictError } from '#packaging-recycling-notes/repository/port.js'
import { buildDraftPrn } from './test-data.js'

/** @typedef {import('../port.js').PackagingRecyclingNotesRepository} PrnRepository */

const ISSUE_USER = { id: 'user-issuer', name: 'Issuer User' }
const RAISER_USER = { id: 'user-raiser', name: 'Raiser User' }

const buildProjection = (existing, overrides = {}) => ({
  ...existing,
  version: existing.version + 1,
  ...overrides
})

export const testPersistProjectionBehaviour = (it) => {
  describe('persistProjection', () => {
    /** @type {PrnRepository} */
    let repository

    beforeEach(
      async (
        /** @type {{ prnRepository: PrnRepository }} */ { prnRepository }
      ) => {
        repository = prnRepository
      }
    )

    describe('basic behaviour', () => {
      it('persists the projection in full', async () => {
        const created = await repository.create(buildDraftPrn())
        const at = new Date()
        const projection = buildProjection(created, {
          updatedAt: at,
          updatedBy: RAISER_USER,
          lastAppliedEventNumber: 1,
          status: {
            currentStatus: PRN_STATUS.AWAITING_AUTHORISATION,
            currentStatusAt: at,
            created: { at, by: RAISER_USER },
            history: [
              ...created.status.history,
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at,
                by: RAISER_USER
              }
            ]
          }
        })

        const persisted = await repository.persistProjection({
          projection,
          expectedVersion: created.version
        })
        assert(persisted)

        expect(persisted.id).toBe(created.id)
        expect(persisted.version).toBe(created.version + 1)
        expect(persisted.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_AUTHORISATION
        )
        expect(persisted.status.currentStatusAt).toEqual(at)
        expect(persisted.status.created).toEqual({ at, by: RAISER_USER })
        expect(persisted.status.history).toHaveLength(2)
        expect(persisted.status.history[1]).toEqual({
          status: PRN_STATUS.AWAITING_AUTHORISATION,
          at,
          by: RAISER_USER
        })
        expect(persisted.updatedAt).toEqual(at)
        expect(persisted.updatedBy).toEqual(RAISER_USER)
        expect(persisted.lastAppliedEventNumber).toBe(1)
      })

      it('returns the persisted PRN with id and without _id leakage', async () => {
        const created = await repository.create(buildDraftPrn())
        const projection = buildProjection(created, {
          updatedAt: new Date(),
          updatedBy: RAISER_USER
        })

        const persisted = await repository.persistProjection({
          projection,
          expectedVersion: created.version
        })
        assert(persisted)

        expect(persisted.id).toBe(created.id)
        expect(Object.keys(persisted)).not.toContain('_id')
      })

      it('returns null when no PRN exists with the given id', async () => {
        const stub = buildDraftPrn()
        const projection = {
          ...stub,
          id: '000000000000000000000000',
          version: 2
        }

        const result = await repository.persistProjection({
          projection,
          expectedVersion: 1
        })

        expect(result).toBeNull()
      })
    })

    describe('version ownership', () => {
      it('derives the persisted version from expectedVersion, ignoring the version the projection carries', async () => {
        const created = await repository.create(buildDraftPrn())
        const projection = buildProjection(created, {
          version: created.version + 99,
          lastAppliedEventNumber: 3
        })

        const persisted = await repository.persistProjection({
          projection,
          expectedVersion: created.version
        })
        assert(persisted)

        expect(persisted.version).toBe(created.version + 1)

        const refetched = await repository.findById(created.id)
        assert(refetched)
        expect(refetched.version).toBe(created.version + 1)
      })
    })

    describe('optimistic concurrency', () => {
      it('throws Boom.conflict when expectedVersion does not match the persisted doc', async () => {
        const created = await repository.create(buildDraftPrn())
        const projection = buildProjection(created)

        await expect(
          repository.persistProjection({
            projection,
            expectedVersion: created.version + 99
          })
        ).rejects.toThrow(/version/i)
      })

      it('rejects a second persistProjection at a stale version', async () => {
        const created = await repository.create(buildDraftPrn())
        const firstProjection = buildProjection(created)

        await repository.persistProjection({
          projection: firstProjection,
          expectedVersion: created.version
        })

        await expect(
          repository.persistProjection({
            projection: buildProjection(created),
            expectedVersion: created.version
          })
        ).rejects.toThrow(/version/i)
      })
    })

    describe('watermark monotonicity', () => {
      it('rejects a projection whose lastAppliedEventNumber regresses', async () => {
        const created = await repository.create(buildDraftPrn())
        const firstProjection = buildProjection(created, {
          lastAppliedEventNumber: 5
        })
        await repository.persistProjection({
          projection: firstProjection,
          expectedVersion: created.version
        })

        const regression = buildProjection(firstProjection, {
          version: firstProjection.version + 1,
          lastAppliedEventNumber: 4
        })

        await expect(
          repository.persistProjection({
            projection: regression,
            expectedVersion: firstProjection.version
          })
        ).rejects.toThrow()
      })
    })

    describe('prnNumber uniqueness', () => {
      it('throws PrnNumberConflictError on a duplicate prnNumber', async () => {
        const prnNumber = `ER26${Date.now().toString().slice(-5)}Z`
        const firstCreated = await repository.create(buildDraftPrn())
        await repository.persistProjection({
          projection: buildProjection(firstCreated, { prnNumber }),
          expectedVersion: firstCreated.version
        })

        const secondCreated = await repository.create(buildDraftPrn())

        await expect(
          repository.persistProjection({
            projection: buildProjection(secondCreated, { prnNumber }),
            expectedVersion: secondCreated.version
          })
        ).rejects.toThrow(PrnNumberConflictError)
      })

      it('persists the projected prnNumber when supplied', async () => {
        const prnNumber = `ER26${Date.now().toString().slice(-5)}A`
        const created = await repository.create(buildDraftPrn())

        const persisted = await repository.persistProjection({
          projection: buildProjection(created, { prnNumber }),
          expectedVersion: created.version
        })
        assert(persisted)

        expect(persisted.prnNumber).toBe(prnNumber)
        const refetched = await repository.findById(created.id)
        assert(refetched)
        expect(refetched.prnNumber).toBe(prnNumber)
      })
    })

    describe('issued slot is recorded as a business operation', () => {
      it('records the issued slot from the projection', async () => {
        const created = await repository.create(buildDraftPrn())
        const at = new Date()
        const projection = buildProjection(created, {
          updatedAt: at,
          updatedBy: ISSUE_USER,
          lastAppliedEventNumber: 2,
          prnNumber: `ER26${Date.now().toString().slice(-5)}B`,
          status: {
            currentStatus: PRN_STATUS.AWAITING_ACCEPTANCE,
            currentStatusAt: at,
            created: { at: created.updatedAt, by: RAISER_USER },
            issued: { at, by: ISSUE_USER },
            history: [
              ...created.status.history,
              {
                status: PRN_STATUS.AWAITING_AUTHORISATION,
                at: created.updatedAt,
                by: RAISER_USER
              },
              {
                status: PRN_STATUS.AWAITING_ACCEPTANCE,
                at,
                by: ISSUE_USER
              }
            ]
          }
        })

        const persisted = await repository.persistProjection({
          projection,
          expectedVersion: created.version
        })
        assert(persisted)

        expect(persisted.status.issued).toEqual({ at, by: ISSUE_USER })
        expect(persisted.status.currentStatus).toBe(
          PRN_STATUS.AWAITING_ACCEPTANCE
        )
      })
    })
  })
}
