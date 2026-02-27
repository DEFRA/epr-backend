import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite, buildFullOverseasSite } from './test-data.js'

export const testCreateBehaviour = (it) => {
  describe('create', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('creates a site and returns it with an id', async () => {
      const input = buildOverseasSite()

      const result = await repository.create(input)

      expect(result.id).toBeDefined()
      expect(typeof result.id).toBe('string')
      expect(result.id.length).toBeGreaterThan(0)
    })

    it('stores the site so it can be retrieved', async () => {
      const input = buildOverseasSite({
        name: 'Acme Reprocessing Ltd',
        country: 'Pakistan'
      })

      const created = await repository.create(input)
      const found = await repository.findById(created.id)

      expect(found).toBeTruthy()
      expect(found.name).toBe('Acme Reprocessing Ltd')
      expect(found.country).toBe('Pakistan')
    })

    it('preserves all fields including optional ones', async () => {
      const input = buildFullOverseasSite({
        name: 'Full Site Test'
      })

      const created = await repository.create(input)
      const found = await repository.findById(created.id)

      expect(found.name).toBe('Full Site Test')
      expect(found.address).toStrictEqual({
        line1: '42 Fictitious Lane',
        line2: 'Industrial Zone B',
        townOrCity: 'TESTVILLE',
        stateOrRegion: 'Test Province',
        postcode: '99001'
      })
      expect(found.country).toBe('India')
      expect(found.coordinates).toBe('51\u00B030\'26.0"N 0\u00B007\'39.0"W')
      expect(new Date(found.validFrom).getTime()).toBe(
        new Date('2026-01-01').getTime()
      )
    })

    it('generates unique ids for each created site', async () => {
      const site1 = await repository.create(buildOverseasSite())
      const site2 = await repository.create(buildOverseasSite())

      expect(site1.id).not.toBe(site2.id)
    })

    it('allows optional fields to be omitted', async () => {
      const input = buildOverseasSite()

      const created = await repository.create(input)
      const found = await repository.findById(created.id)

      expect(found.coordinates).toBeUndefined()
      expect(found.validFrom).toBeUndefined()
      expect(found.address.line2).toBeUndefined()
      expect(found.address.stateOrRegion).toBeUndefined()
      expect(found.address.postcode).toBeUndefined()
    })
  })
}
