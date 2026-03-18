import { describe, beforeEach, expect } from 'vitest'
import { buildOverseasSite, buildFullOverseasSite } from './test-data.js'

export const testFindByPropertiesBehaviour = (it) => {
  describe('findByProperties', () => {
    let repository

    beforeEach(async ({ overseasSitesRepository }) => {
      repository = overseasSitesRepository
    })

    it('returns null when no matching site exists', async () => {
      const result = await repository.findByProperties({
        name: 'Non-existent Site',
        country: 'Germany',
        address: { line1: '1 Nowhere St', townOrCity: 'Berlin' }
      })

      expect(result).toBeNull()
    })

    it('returns the site when all properties match', async () => {
      const site = buildOverseasSite({
        name: 'Acme Reprocessing',
        country: 'India',
        address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
      })
      const created = await repository.create(site)

      const found = await repository.findByProperties({
        name: 'Acme Reprocessing',
        country: 'India',
        address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
      })

      expect(found).toBeTruthy()
      expect(found.id).toBe(created.id)
    })

    it('returns null when name differs', async () => {
      await repository.create(
        buildOverseasSite({
          name: 'Acme Reprocessing',
          country: 'India',
          address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
        })
      )

      const found = await repository.findByProperties({
        name: 'Different Name',
        country: 'India',
        address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
      })

      expect(found).toBeNull()
    })

    it('returns null when country differs', async () => {
      await repository.create(
        buildOverseasSite({
          name: 'Acme Reprocessing',
          country: 'India',
          address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
        })
      )

      const found = await repository.findByProperties({
        name: 'Acme Reprocessing',
        country: 'Pakistan',
        address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
      })

      expect(found).toBeNull()
    })

    it('returns null when address line1 differs', async () => {
      await repository.create(
        buildOverseasSite({
          name: 'Acme Reprocessing',
          country: 'India',
          address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
        })
      )

      const found = await repository.findByProperties({
        name: 'Acme Reprocessing',
        country: 'India',
        address: { line1: '99 Other Rd', townOrCity: 'Mumbai' }
      })

      expect(found).toBeNull()
    })

    it('returns null when townOrCity differs', async () => {
      await repository.create(
        buildOverseasSite({
          name: 'Acme Reprocessing',
          country: 'India',
          address: { line1: '42 Industrial Rd', townOrCity: 'Mumbai' }
        })
      )

      const found = await repository.findByProperties({
        name: 'Acme Reprocessing',
        country: 'India',
        address: { line1: '42 Industrial Rd', townOrCity: 'Delhi' }
      })

      expect(found).toBeNull()
    })

    it('matches with all optional fields populated', async () => {
      const site = buildFullOverseasSite({
        name: 'Full Match Site',
        country: 'Germany'
      })
      const created = await repository.create(site)

      const found = await repository.findByProperties({
        name: 'Full Match Site',
        country: 'Germany',
        address: site.address,
        coordinates: site.coordinates,
        validFrom: site.validFrom
      })

      expect(found).toBeTruthy()
      expect(found.id).toBe(created.id)
    })

    it('returns null when coordinates differ', async () => {
      const site = buildFullOverseasSite({
        name: 'Coords Site',
        coordinates: '51.5074,-0.1278'
      })
      await repository.create(site)

      const found = await repository.findByProperties({
        name: 'Coords Site',
        country: site.country,
        address: site.address,
        coordinates: '48.8566,2.3522',
        validFrom: site.validFrom
      })

      expect(found).toBeNull()
    })

    it('returns null when validFrom differs', async () => {
      const site = buildFullOverseasSite({
        name: 'Date Site',
        validFrom: new Date('2026-01-01')
      })
      await repository.create(site)

      const found = await repository.findByProperties({
        name: 'Date Site',
        country: site.country,
        address: site.address,
        coordinates: site.coordinates,
        validFrom: new Date('2026-06-01')
      })

      expect(found).toBeNull()
    })

    it('treats undefined and null coordinates as equivalent', async () => {
      const site = buildOverseasSite({ name: 'No Coords Site' })
      const created = await repository.create(site)

      const found = await repository.findByProperties({
        name: 'No Coords Site',
        country: site.country,
        address: site.address,
        coordinates: null
      })

      expect(found).toBeTruthy()
      expect(found.id).toBe(created.id)
    })

    it('treats undefined and null validFrom as equivalent', async () => {
      const site = buildOverseasSite({ name: 'No Date Site' })
      const created = await repository.create(site)

      const found = await repository.findByProperties({
        name: 'No Date Site',
        country: site.country,
        address: site.address,
        validFrom: null
      })

      expect(found).toBeTruthy()
      expect(found.id).toBe(created.id)
    })

    it('returns first match when multiple identical sites exist', async () => {
      const site = buildOverseasSite({
        name: 'Duplicate Site',
        country: 'France',
        address: { line1: '1 Rue de Test', townOrCity: 'Paris' }
      })
      const first = await repository.create(site)
      await repository.create(
        buildOverseasSite({
          name: 'Duplicate Site',
          country: 'France',
          address: { line1: '1 Rue de Test', townOrCity: 'Paris' }
        })
      )

      const found = await repository.findByProperties({
        name: 'Duplicate Site',
        country: 'France',
        address: { line1: '1 Rue de Test', townOrCity: 'Paris' }
      })

      expect(found).toBeTruthy()
      expect(found.id).toBe(first.id)
    })
  })
}
