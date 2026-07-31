/**
 * Material labels for the CSV exports generated from admin: the public
 * register, the summary-log uploads report and the report submissions report.
 *
 * These are a frozen vocabulary, deliberately distinct from how materials are
 * shown on screen in epr-frontend. The public register has already been
 * published with these strings, so changing them is a policy decision rather
 * than an engineering one. Two differences matter:
 *
 *   - 'Fibre based composite' here, 'Fibre-based composite' on screen.
 *   - Glass is joined into one label across every process a registration holds
 *     ('Glass-remelt-other'), which the on-screen vocabulary cannot express
 *     because it names a single process.
 */

import { GLASS_RECYCLING_PROCESS, MATERIAL } from '#domain/materials.js'

/** @import {GlassRecyclingProcess, Material} from '#domain/materials.js' */

/**
 * Total map, so a new material cannot be added without deciding how it is
 * labelled in a published export.
 * @type {Record<Material, string>}
 */
const MATERIAL_CSV_LABEL = Object.freeze({
  [MATERIAL.ALUMINIUM]: 'Aluminium',
  [MATERIAL.FIBRE]: 'Fibre based composite',
  [MATERIAL.GLASS]: 'Glass',
  [MATERIAL.PAPER]: 'Paper and board',
  [MATERIAL.PLASTIC]: 'Plastic',
  [MATERIAL.STEEL]: 'Steel',
  [MATERIAL.WOOD]: 'Wood'
})

/** @type {Record<GlassRecyclingProcess, string>} */
const glassProcessToCsvLabel = Object.freeze({
  [GLASS_RECYCLING_PROCESS.GLASS_RE_MELT]: 'remelt',
  [GLASS_RECYCLING_PROCESS.GLASS_OTHER]: 'other'
})

/**
 * Formats a registration's material as it appears in a CSV export. Glass is
 * suffixed with each recycling process the registration holds; every other
 * material is a straight lookup.
 *
 * A glass registration with no recorded process falls back to a bare 'Glass'.
 * That should be unreachable — form submissions are split so each registration
 * carries exactly one process — and note the uploads report response schema
 * does not accept it, so it would fail response validation if it ever occurred.
 *
 * @param {Material} material
 * @param {GlassRecyclingProcess[]} [glassRecyclingProcess]
 * @returns {string}
 */
export const formatMaterialCsvLabel = (
  material,
  glassRecyclingProcess = []
) => {
  if (material === MATERIAL.GLASS && glassRecyclingProcess?.length > 0) {
    const processes = glassRecyclingProcess
      .map((process) => glassProcessToCsvLabel[process])
      .join('-')

    return `Glass-${processes}`
  }

  return MATERIAL_CSV_LABEL[material]
}

const glassLabel = (...processes) =>
  formatMaterialCsvLabel(MATERIAL.GLASS, processes)

/**
 * Every label the formatter emits for a registration carrying at least one
 * glass process — the set the uploads report response schema pins.
 * @type {readonly string[]}
 */
export const materialCsvLabels = Object.freeze([
  ...Object.entries(MATERIAL_CSV_LABEL)
    .filter(([material]) => material !== MATERIAL.GLASS)
    .map(([, label]) => label),
  glassLabel(GLASS_RECYCLING_PROCESS.GLASS_RE_MELT),
  glassLabel(GLASS_RECYCLING_PROCESS.GLASS_OTHER),
  glassLabel(
    GLASS_RECYCLING_PROCESS.GLASS_RE_MELT,
    GLASS_RECYCLING_PROCESS.GLASS_OTHER
  )
])
