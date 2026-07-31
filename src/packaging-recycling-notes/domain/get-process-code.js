import { materialToProcessCode } from '#domain/materials.js'

/** @import {ProcessCode} from '#domain/materials.js' */

/**
 * Get the EU waste recovery operation code for a material
 * @param {string} material - The material type (e.g. 'paper', 'plastic', 'glass')
 * @returns {ProcessCode|null} The process code (e.g. 'R3', 'R4', 'R5') or null if unknown
 */
export function getProcessCode(material) {
  if (!material) {
    return null
  }
  return materialToProcessCode[material.toLowerCase()] ?? null
}
