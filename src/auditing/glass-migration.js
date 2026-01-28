import { audit } from '@defra/cdp-auditing'

/**
 * @import {SystemLogsRepository} from '#repositories/system-logs/port.js'
 */

const SYSTEM_USER = { id: 'system', email: 'system', scope: [] }

/**
 * Extract registration number changes from before/after state
 * @param {Object[]} originalRegistrations
 * @param {Object[]} migratedRegistrations
 * @returns {Array<{id: string, from: string, to: string|string[]}>}
 */
function extractRegistrationChanges(
  originalRegistrations,
  migratedRegistrations
) {
  const changes = []

  for (const original of originalRegistrations || []) {
    if (!original.registrationNumber?.endsWith('GL')) {
      continue
    }

    const baseNumber = original.registrationNumber.slice(0, -2)

    // Find migrated registration(s) - could be 1 (rename) or 2 (split)
    // Must end with GR or GO (the glass suffixes)
    const migrated = migratedRegistrations.filter(
      (r) =>
        r.registrationNumber === baseNumber + 'GR' ||
        r.registrationNumber === baseNumber + 'GO'
    )

    if (migrated.length === 1) {
      changes.push({
        id: original.id,
        from: original.registrationNumber,
        to: migrated[0].registrationNumber
      })
    } else if (migrated.length === 2) {
      changes.push({
        id: original.id,
        from: original.registrationNumber,
        to: migrated.map((r) => r.registrationNumber)
      })
    }
  }

  return changes
}

/**
 * Extract accreditation number changes from before/after state
 * @param {Object[]} originalAccreditations
 * @param {Object[]} migratedAccreditations
 * @returns {Array<{id: string, from: string, to: string|string[]}>}
 */
function extractAccreditationChanges(
  originalAccreditations,
  migratedAccreditations
) {
  const changes = []

  for (const original of originalAccreditations || []) {
    if (!original.accreditationNumber?.endsWith('GL')) {
      continue
    }

    const baseNumber = original.accreditationNumber.slice(0, -2)

    // Find migrated accreditation(s) - could be 1 (rename) or 2 (split)
    // Must end with GR or GO (the glass suffixes)
    const migrated = migratedAccreditations.filter(
      (a) =>
        a.accreditationNumber === baseNumber + 'GR' ||
        a.accreditationNumber === baseNumber + 'GO'
    )

    if (migrated.length === 1) {
      changes.push({
        id: original.id,
        from: original.accreditationNumber,
        to: migrated[0].accreditationNumber
      })
    } else if (migrated.length === 2) {
      changes.push({
        id: original.id,
        from: original.accreditationNumber,
        to: migrated.map((a) => a.accreditationNumber)
      })
    }
  }

  return changes
}

/**
 * Audit a glass migration for an organisation.
 * This is a system-initiated action (no user request context).
 * Only logs the specific changes (registration/accreditation number changes).
 *
 * @param {SystemLogsRepository} systemLogsRepository
 * @param {string} organisationId
 * @param {Object} previous - Organisation state before migration
 * @param {Object} next - Organisation state after migration
 */
async function auditGlassMigration(
  systemLogsRepository,
  organisationId,
  previous,
  next
) {
  const registrationChanges = extractRegistrationChanges(
    previous.registrations,
    next.registrations
  )
  const accreditationChanges = extractAccreditationChanges(
    previous.accreditations,
    next.accreditations
  )

  const payload = {
    event: {
      category: 'entity',
      subCategory: 'epr-organisations',
      action: 'glass-migration'
    },
    context: {
      organisationId,
      registrations: registrationChanges,
      accreditations: accreditationChanges
    },
    user: SYSTEM_USER
  }

  audit(payload)
  await systemLogsRepository.insert({
    createdAt: new Date(),
    createdBy: SYSTEM_USER,
    event: payload.event,
    context: payload.context
  })
}

export { auditGlassMigration }
