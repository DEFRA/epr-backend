import { isNil } from '#common/helpers/is-nil.js'

/** @import {Material} from '#domain/organisations/model.js' */

/**
 * Mapping between spreadsheet material values and registration material types
 */
export const MATERIAL_MAP = Object.freeze({
  Aluminium: 'aluminium',
  Fibre_based_composite: 'fibre',
  Glass_remelt: 'glass',
  Glass_other: 'glass',
  Paper_and_board: 'paper',
  Plastic: 'plastic',
  Steel: 'steel',
  Wood: 'wood'
})

/**
 * Maps glass spreadsheet values to the required glassRecyclingProcess value
 */
export const GLASS_PROCESS_MAP = Object.freeze({
  Glass_remelt: 'glass_re_melt',
  Glass_other: 'glass_other'
})

/** @type {Readonly<Record<string, Material>>} */
const MATERIAL_BY_SPREADSHEET_VALUE = Object.freeze({
  ...MATERIAL_MAP,
  ...GLASS_PROCESS_MAP
})

/**
 * The material a stored spreadsheet material value names, as `resolveMaterial`
 * returns it for the registration it was validated against.
 *
 * @param {unknown} spreadsheetMaterial
 * @returns {Material | undefined}
 */
export const materialFromSpreadsheet = (spreadsheetMaterial) =>
  typeof spreadsheetMaterial === 'string' &&
  Object.hasOwn(MATERIAL_BY_SPREADSHEET_VALUE, spreadsheetMaterial)
    ? MATERIAL_BY_SPREADSHEET_VALUE[spreadsheetMaterial]
    : undefined

/**
 * A stored meta value as the upload checks compare it: trimmed text, or blank.
 *
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export const metaText = (value) => (isNil(value) ? '' : String(value).trim())
