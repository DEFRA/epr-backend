import { describe, beforeEach, expect } from 'vitest'

const WATERMARK_A = {
  submittedAt: '2025-01-01T00:00:00.000Z',
  summaryLogId: 'file-sl-1'
}
const WATERMARK_B = {
  submittedAt: '2025-02-01T00:00:00.000Z',
  summaryLogId: 'file-sl-2'
}

export const testSummaryLogRowStatesBackfillWatermarkRepositoryContract = (
  it
) => {
  describe('summary-log-row-states backfill watermark repository', () => {
    let repository

    beforeEach((/** @type {*} */ { watermarkRepository }) => {
      repository = watermarkRepository()
    })

    it('returns null when no watermark has been advanced', async () => {
      expect(await repository.read('org-1', 'reg-1')).toBeNull()
    })

    it('reads back an advanced watermark', async () => {
      await repository.advance('org-1', 'reg-1', WATERMARK_A)

      expect(await repository.read('org-1', 'reg-1')).toEqual(WATERMARK_A)
    })

    it('overwrites the watermark on a later advance', async () => {
      await repository.advance('org-1', 'reg-1', WATERMARK_A)
      await repository.advance('org-1', 'reg-1', WATERMARK_B)

      expect(await repository.read('org-1', 'reg-1')).toEqual(WATERMARK_B)
    })

    it('keeps a separate watermark per registration', async () => {
      await repository.advance('org-1', 'reg-1', WATERMARK_A)
      await repository.advance('org-1', 'reg-2', WATERMARK_B)

      expect(await repository.read('org-1', 'reg-1')).toEqual(WATERMARK_A)
      expect(await repository.read('org-1', 'reg-2')).toEqual(WATERMARK_B)
    })

    it('keeps a separate watermark per organisation for the same registration id', async () => {
      await repository.advance('org-1', 'reg-1', WATERMARK_A)

      expect(await repository.read('org-2', 'reg-1')).toBeNull()
    })
  })
}
