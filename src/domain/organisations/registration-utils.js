import {
  ACTIVE_ACCREDITATION_STATUSES,
  MATERIAL
} from '#domain/organisations/model.js'

/** @import { StoredAccreditationStatus, AppliedForMaterial, GlassRecyclingProcess, Material } from '#domain/organisations/model.js' */

/**
 * @typedef {{ accreditation: { status: StoredAccreditationStatus } | null }} AccreditationLink
 */

/**
 * Returns true when the registration is linked to an accreditation that is
 * live (approved or suspended). A linked accreditation alone is not
 * sufficient — an accreditation in 'created', 'rejected', or 'cancelled'
 * state has never been active and must be treated as registered-only.
 *
 * @param {AccreditationLink} registration
 * @returns {boolean}
 */
export function isRegistrationAccredited({ accreditation }) {
  return accreditation
    ? ACTIVE_ACCREDITATION_STATUSES.has(accreditation.status)
    : false
}

/**
 * Resolves the material a record is for from the material it applied for.
 *
 * Glass is the only applied for material that sub-divides: ingest splits a
 * glass submission into one record per recycling process, so a record that
 * applied for glass is for the material that single process names. ADR-0050
 * records that no stored record is unsplit, and this is the one place that
 * claim is asserted. Every other applied for material is already the material.
 *
 * @param {{ id: string, material: AppliedForMaterial, glassRecyclingProcess?: GlassRecyclingProcess[] | null }} record
 * @returns {Material}
 */
export function resolveMaterial(record) {
  if (record.material !== MATERIAL.GLASS) {
    return record.material
  }

  const [process, ...furtherProcesses] = record.glassRecyclingProcess ?? []
  if (process === undefined || furtherProcesses.length > 0) {
    throw new Error(
      `Record ${record.id} applied for glass but does not carry exactly one recycling process`
    )
  }
  return process
}
