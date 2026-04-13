/**
 * @typedef {Object} OverseasSiteAddress
 * @property {string} line1
 * @property {string} [line2]
 * @property {string} townOrCity
 * @property {string} [stateOrRegion]
 * @property {string} [postcode]
 */

/**
 * @typedef {Object} OverseasSite
 * @property {string} id
 * @property {string} name
 * @property {OverseasSiteAddress} address
 * @property {string} country
 * @property {string} [coordinates]
 * @property {Date} [validFrom]
 * @property {Date} createdAt
 * @property {Date} updatedAt
 */

/**
 * @typedef {Object} FindAllParams
 * @property {string} [name] - Partial match filter on site name
 * @property {string} [country] - Exact match filter on country
 */

/**
 * @typedef {Object} FindByPropertiesParams
 * @property {string} name
 * @property {string} country
 * @property {OverseasSiteAddress} address
 * @property {string} [coordinates]
 * @property {Date} [validFrom]
 */

/**
 * @typedef {Object} OverseasSitesRepository
 * @property {(id: string) => Promise<OverseasSite | null>} findById
 * @property {(properties: FindByPropertiesParams) => Promise<OverseasSite | null>} findByProperties
 * @property {(site: Omit<OverseasSite, 'id'>) => Promise<OverseasSite>} create
 * @property {(id: string, updates: Partial<Omit<OverseasSite, 'id' | 'createdAt'>>) => Promise<OverseasSite | null>} update
 * @property {(id: string) => Promise<OverseasSite | null>} remove
 * @property {(params?: FindAllParams) => Promise<OverseasSite[]>} findAll
 * @property {(ids: string[]) => Promise<OverseasSite[]>} findByIds
 */

/**
 * @typedef {() => OverseasSitesRepository} OverseasSitesRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
