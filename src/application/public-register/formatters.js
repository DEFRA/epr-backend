/**
 * Pure utility functions for formatting public register data
 */

/** @import {RegistrationAddress} from '#repositories/organisations/port.js' */
/** @import {Material, GlassRecyclingProcess, TonnageBand, Address} from '#domain/organisations/model.js' */

import {
  GLASS_RECYCLING_PROCESS,
  MATERIAL
} from '#domain/organisations/model.js'

const MATERIAL_DISPLAY_NAMES = {
  [MATERIAL.FIBRE]: 'Fibre based composite',
  [MATERIAL.PAPER]: 'Paper and board'
}

const GLASS_RECYCLING_PROCESS_MAPPING = {
  [GLASS_RECYCLING_PROCESS.GLASS_OTHER]: 'other',
  [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]: 'remelt'
}

export const ANNEX_II_PROCESS = {
  [MATERIAL.GLASS]: 'R5',
  [MATERIAL.PAPER]: 'R3',
  [MATERIAL.PLASTIC]: 'R3',
  [MATERIAL.STEEL]: 'R4',
  [MATERIAL.WOOD]: 'R3',
  [MATERIAL.FIBRE]: 'R3',
  [MATERIAL.ALUMINIUM]: 'R4'
}

export const TONNAGE_BAND_DISPLAY_NAMES = {
  up_to_500: 'Up to 500 tonnes',
  up_to_5000: 'Up to 5,000 tonnes',
  up_to_10000: 'Up to 10,000 tonnes',
  over_10000: 'Over 10,000 tonnes'
}

/**
 * Formats an address object into a single comma-separated string
 * Excludes the fullAddress field
 * @param {RegistrationAddress | Address | undefined} address -
 * @returns {string} -
 */
export function formatAddress(address) {
  if (!address) {
    return ''
  }
  const parts = [
    address.line1,
    address.line2,
    address.town,
    address.county,
    address.postcode,
    address.region,
    address.country
  ].filter(Boolean)

  return parts.join(', ')
}

/**
 * Capitalizes first letter, lowercases the rest
 * @param {string} str - String to capitalize
 * @returns {string} - String with first letter capitalized (e.g., 'approved' → 'Approved')
 */
export function capitalize(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : ''
}

/**
 * Formats material to human-readable format with special handling for glass
 * @param {Material} material - Material constant (e.g., 'plastic', 'glass')
 * @param {GlassRecyclingProcess[]} glassRecyclingProcess - Array of glass recycling processes (for glass material only)
 * @returns {string} - Formatted material (e.g., 'Plastic', 'Glass-remelt', 'Glass-remelt-other')
 */
export function formatMaterial(material, glassRecyclingProcess = []) {
  if (material === MATERIAL.GLASS && glassRecyclingProcess?.length > 0) {
    const recyclingProcesses = glassRecyclingProcess
      .map((process) => GLASS_RECYCLING_PROCESS_MAPPING[process])
      .join('-')

    return `Glass-${recyclingProcesses}`
  }

  return MATERIAL_DISPLAY_NAMES[material] || capitalize(material)
}

/**
 * Gets Annex II Process code for a material
 * @param {Material} material - Material constant
 * @returns {string} - Annex II process code (e.g., 'R3', 'R4', 'R5')
 */
export function getAnnexIIProcess(material) {
  return ANNEX_II_PROCESS[material] || ''
}

/**
 * Formats tonnage band to human-readable format
 * @param {TonnageBand} tonnageBand - Tonnage band key (e.g., 'up_to_500', 'up_to_5000')
 * @returns {string} - Formatted tonnage band (e.g., 'Up to 500 tonnes')
 */
export function formatTonnageBand(tonnageBand) {
  return TONNAGE_BAND_DISPLAY_NAMES[tonnageBand] || ''
}
