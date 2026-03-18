import { registerRepository } from '#plugins/register-repository.js'
import { ObjectId } from 'mongodb'
import { validateOverseasSiteInsert } from './validation.js'

/** @import { OverseasSite, FindAllParams, FindByPropertiesParams } from './port.js' */

/** @typedef {Map<string, OverseasSite>} Storage */

/**
 * @param {Storage} storage
 * @returns {(id: string) => Promise<OverseasSite | null>}
 */
const performFindById = (storage) => async (id) => {
  const site = storage.get(id)
  return site ? structuredClone(site) : null
}

/**
 * @param {Storage} storage
 * @returns {(site: Omit<OverseasSite, 'id'>) => Promise<OverseasSite>}
 */
const performCreate = (storage) => async (site) => {
  const validated = validateOverseasSiteInsert(site)
  const id = new ObjectId().toHexString()
  const siteWithId = { ...validated, id }
  storage.set(id, structuredClone(siteWithId))
  return structuredClone(siteWithId)
}

/**
 * @param {Storage} storage
 * @returns {(id: string, updates: Partial<Omit<OverseasSite, 'id' | 'createdAt'>>) => Promise<OverseasSite | null>}
 */
const performUpdate = (storage) => async (id, updates) => {
  const site = storage.get(id)
  if (!site) {
    return null
  }

  const updated = { ...site, ...updates }
  storage.set(id, structuredClone(updated))
  return structuredClone(updated)
}

/**
 * @param {Storage} storage
 * @returns {(id: string) => Promise<boolean>}
 */
const performRemove = (storage) => async (id) => {
  return storage.delete(id)
}

/**
 * @param {*} a
 * @param {*} b
 */
const nullishEqual = (a, b) => (a == null && b == null) || a === b

/**
 * @param {*} a
 * @param {*} b
 */
const dateEqual = (a, b) => {
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  return new Date(a).getTime() === new Date(b).getTime()
}

/**
 * @param {Storage} storage
 * @returns {(properties: FindByPropertiesParams) => Promise<OverseasSite | null>}
 */
const performFindByProperties = (storage) => async (properties) => {
  for (const site of storage.values()) {
    if (
      site.name === properties.name &&
      site.country === properties.country &&
      site.address.line1 === properties.address.line1 &&
      site.address.townOrCity === properties.address.townOrCity &&
      nullishEqual(site.address.line2, properties.address.line2) &&
      nullishEqual(
        site.address.stateOrRegion,
        properties.address.stateOrRegion
      ) &&
      nullishEqual(site.address.postcode, properties.address.postcode) &&
      nullishEqual(site.coordinates, properties.coordinates) &&
      dateEqual(site.validFrom, properties.validFrom)
    ) {
      return structuredClone(site)
    }
  }
  return null
}

/**
 * @param {Storage} storage
 * @returns {(params?: FindAllParams) => Promise<OverseasSite[]>}
 */
const performFindAll = (storage) => async (params) => {
  let results = [...storage.values()]

  if (params?.country) {
    results = results.filter((site) => site.country === params.country)
  }

  if (params?.name) {
    const lowerName = params.name.toLowerCase()
    results = results.filter((site) =>
      site.name.toLowerCase().includes(lowerName)
    )
  }

  return results.map((site) => structuredClone(site))
}

/**
 * @param {Array<OverseasSite & {_id?: import('mongodb').ObjectId}>} [initialData]
 */
export function createInMemoryOverseasSitesRepository(initialData = []) {
  /** @type {Storage} */
  const storage = new Map()

  for (const site of initialData) {
    const id = site._id?.toString() ?? site.id
    storage.set(id, structuredClone({ ...site, id }))
  }

  return () => ({
    create: performCreate(storage),
    findAll: performFindAll(storage),
    findById: performFindById(storage),
    findByProperties: performFindByProperties(storage),
    remove: performRemove(storage),
    update: performUpdate(storage)
  })
}

export function createInMemoryOverseasSitesRepositoryPlugin(initialSites) {
  const factory = createInMemoryOverseasSitesRepository(initialSites)
  const repository = factory()

  return {
    name: 'overseasSitesRepository',
    register: (server) => {
      registerRepository(server, 'overseasSitesRepository', () => repository)
    }
  }
}
