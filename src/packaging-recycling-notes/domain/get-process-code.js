import { MATERIAL } from '#domain/organisations/model.js'

/**
 * EU waste recovery operation codes for packaging materials
 * @see https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02008L0098-20180705
 */
const PROCESS_CODE = Object.freeze({
  R3: 'R3', // Recycling/reclamation of organic substances
  R4: 'R4', // Recycling/reclamation of metals and metal compounds
  R5: 'R5' // Recycling/reclamation of inorganic materials
})

/**
 * Mapping of material types to their EU waste recovery operation codes
 * @type {Record<string, string>}
 */
const MATERIAL_TO_PROCESS_CODE = Object.freeze({
  [MATERIAL.ALUMINIUM]: PROCESS_CODE.R4,
  [MATERIAL.FIBRE]: PROCESS_CODE.R3,
  [MATERIAL.GLASS]: PROCESS_CODE.R5,
  [MATERIAL.PAPER]: PROCESS_CODE.R3,
  [MATERIAL.PLASTIC]: PROCESS_CODE.R3,
  [MATERIAL.STEEL]: PROCESS_CODE.R4,
  [MATERIAL.WOOD]: PROCESS_CODE.R3
})

/**
 * Get the EU waste recovery operation code for a material
 * @param {string} material - The material type (e.g. 'paper', 'plastic', 'glass')
 * @returns {string|null} The process code (e.g. 'R3', 'R4', 'R5') or null if unknown
 */
export function getProcessCode(material) {
  if (!material) {
    return null
  }
  return MATERIAL_TO_PROCESS_CODE[material.toLowerCase()] ?? null
}
