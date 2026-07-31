import { materialToProcessCode } from '#domain/materials.js'

/** @import {Material, ProcessCode} from '#domain/materials.js' */

/**
 * Get the EU waste recovery operation code for a material.
 *
 * Callers pass a PRN's accreditation snapshot material, which every repository
 * read validates against the material enum, so the lookup only misses on data
 * that has bypassed the repository.
 *
 * @param {Material} material
 * @returns {ProcessCode|null} The process code (e.g. 'R3', 'R4', 'R5') or null if unknown
 */
export const getProcessCode = (material) =>
  materialToProcessCode[material] ?? null
