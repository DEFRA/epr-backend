import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite } from './test-data.js'

export const testUpdateBehaviour = (it) => {
  describe('update', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns null when updating non-existent site', async () => {
      const result = await repository.update('000000000000000000000000', {
        name: 'Updated'
      })

      expect(result).toBeNull()
    })

    it('updates the name', async () => {
      const created = await repository.create(
        buildOverseasSite({ name: 'Original Name' })
      )

      const updated = await repository.update(created.id, {
        name: 'New Name',
        updatedAt: new Date()
      })

      expect(updated.name).toBe('New Name')
      expect(updated.id).toBe(created.id)
    })

    it('updates the address', async () => {
      const created = await repository.create(buildOverseasSite())

      const newAddress = {
        line1: '99 New Road',
        line2: 'Suite 4',
        townOrCity: 'NEWTOWN',
        stateOrRegion: 'New State',
        postcode: 'NT1 1NT'
      }

      const updated = await repository.update(created.id, {
        address: newAddress,
        updatedAt: new Date()
      })

      expect(updated.address).toStrictEqual(newAddress)
    })

    it('updates the country', async () => {
      const created = await repository.create(
        buildOverseasSite({ country: 'India' })
      )

      const updated = await repository.update(created.id, {
        country: 'Pakistan',
        updatedAt: new Date()
      })

      expect(updated.country).toBe('Pakistan')
    })

    it('persists updates for subsequent retrieval', async () => {
      const created = await repository.create(
        buildOverseasSite({ name: 'Before' })
      )

      await repository.update(created.id, {
        name: 'After',
        updatedAt: new Date()
      })

      const found = await repository.findById(created.id)
      expect(found.name).toBe('After')
    })

    it('preserves fields not included in the update', async () => {
      const created = await repository.create(
        buildOverseasSite({ name: 'Keep Me', country: 'India' })
      )

      await repository.update(created.id, {
        country: 'Pakistan',
        updatedAt: new Date()
      })

      const found = await repository.findById(created.id)
      expect(found.name).toBe('Keep Me')
      expect(found.country).toBe('Pakistan')
    })
  })
}
