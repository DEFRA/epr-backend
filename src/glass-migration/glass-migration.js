import { ObjectId } from 'mongodb'

const GL_SUFFIX = 'GL'
const GR_SUFFIX = 'GR'
const GO_SUFFIX = 'GO'
const GLASS_RE_MELT = 'glass_re_melt'
const GLASS_OTHER = 'glass_other'

/**
 * Check if a number string ends with GL suffix
 * @param {string|null|undefined} number
 * @returns {boolean}
 */
function hasGlSuffix(number) {
  return number?.endsWith(GL_SUFFIX) ?? false
}

/**
 * Replace GL suffix with new suffix
 * @param {string} number
 * @param {string} newSuffix
 * @returns {string}
 */
function replaceSuffix(number, newSuffix) {
  return number.slice(0, -GL_SUFFIX.length) + newSuffix
}

/**
 * Generate a new MongoDB ObjectId
 * @returns {string}
 */
function generateId() {
  return new ObjectId().toString()
}

/**
 * Determine if a registration needs migration (has GL suffix and is glass)
 * @param {Object} registration
 * @returns {boolean}
 */
function isGlassRegistrationNeedingMigration(registration) {
  return (
    registration.material === 'glass' &&
    hasGlSuffix(registration.registrationNumber)
  )
}

/**
 * Determine if an accreditation needs migration (has GL suffix and is glass)
 * @param {Object} accreditation
 * @returns {boolean}
 */
function isGlassAccreditationNeedingMigration(accreditation) {
  return (
    accreditation.material === 'glass' &&
    hasGlSuffix(accreditation.accreditationNumber)
  )
}

/**
 * Check if glassRecyclingProcess contains both remelt and other
 * @param {string[]|null|undefined} glassRecyclingProcess
 * @returns {boolean}
 */
function hasBothGlassProcesses(glassRecyclingProcess) {
  if (!Array.isArray(glassRecyclingProcess)) {
    return false
  }
  return (
    glassRecyclingProcess.includes(GLASS_RE_MELT) &&
    glassRecyclingProcess.includes(GLASS_OTHER)
  )
}

/**
 * Get the appropriate suffix based on glass recycling process
 * @param {string[]} glassRecyclingProcess
 * @returns {string}
 * @throws {Error} If glassRecyclingProcess doesn't contain a valid process
 */
function getSuffixForProcess(glassRecyclingProcess) {
  if (glassRecyclingProcess?.includes(GLASS_RE_MELT)) {
    return GR_SUFFIX
  }
  if (glassRecyclingProcess?.includes(GLASS_OTHER)) {
    return GO_SUFFIX
  }
  throw new Error(
    `Cannot determine suffix: glassRecyclingProcess must contain '${GLASS_RE_MELT}' or '${GLASS_OTHER}', got: ${JSON.stringify(glassRecyclingProcess)}`
  )
}

/**
 * Transform a glass registration - rename or split as needed
 * @param {Object} registration
 * @returns {Object[]} Array of transformed registrations (1 or 2)
 */
export function transformGlassRegistration(registration) {
  if (!isGlassRegistrationNeedingMigration(registration)) {
    return [registration]
  }

  const { glassRecyclingProcess } = registration

  if (hasBothGlassProcesses(glassRecyclingProcess)) {
    // Split into two registrations
    const remeltReg = {
      ...registration,
      registrationNumber: replaceSuffix(
        registration.registrationNumber,
        GR_SUFFIX
      ),
      glassRecyclingProcess: [GLASS_RE_MELT]
    }

    const otherReg = {
      ...registration,
      id: generateId(),
      registrationNumber: replaceSuffix(
        registration.registrationNumber,
        GO_SUFFIX
      ),
      glassRecyclingProcess: [GLASS_OTHER]
    }

    return [remeltReg, otherReg]
  }

  // Simple rename
  const newSuffix = getSuffixForProcess(glassRecyclingProcess)
  return [
    {
      ...registration,
      registrationNumber: replaceSuffix(
        registration.registrationNumber,
        newSuffix
      )
    }
  ]
}

/**
 * Transform a glass accreditation - rename or split as needed
 * @param {Object} accreditation
 * @returns {Object[]} Array of transformed accreditations (1 or 2)
 */
export function transformGlassAccreditation(accreditation) {
  if (!isGlassAccreditationNeedingMigration(accreditation)) {
    return [accreditation]
  }

  const { glassRecyclingProcess } = accreditation

  if (hasBothGlassProcesses(glassRecyclingProcess)) {
    // Split into two accreditations
    const remeltAcc = {
      ...accreditation,
      accreditationNumber: replaceSuffix(
        accreditation.accreditationNumber,
        GR_SUFFIX
      ),
      glassRecyclingProcess: [GLASS_RE_MELT]
    }

    const otherAcc = {
      ...accreditation,
      id: generateId(),
      accreditationNumber: replaceSuffix(
        accreditation.accreditationNumber,
        GO_SUFFIX
      ),
      glassRecyclingProcess: [GLASS_OTHER]
    }

    return [remeltAcc, otherAcc]
  }

  // Simple rename
  const newSuffix = getSuffixForProcess(glassRecyclingProcess)
  return [
    {
      ...accreditation,
      accreditationNumber: replaceSuffix(
        accreditation.accreditationNumber,
        newSuffix
      )
    }
  ]
}

/**
 * Check if an organisation needs migration
 * @param {Object} org
 * @returns {boolean}
 */
export function shouldMigrateOrganisation(org) {
  const hasGlassRegNeedingMigration = org.registrations?.some(
    isGlassRegistrationNeedingMigration
  )
  const hasGlassAccNeedingMigration = org.accreditations?.some(
    isGlassAccreditationNeedingMigration
  )

  return hasGlassRegNeedingMigration || hasGlassAccNeedingMigration
}

/**
 * Build a mapping from old accreditation ID to new accreditation IDs
 * for split accreditations
 * @param {Object[]} originalAccreditations
 * @param {Object[]} transformedAccreditations
 * @returns {Map<string, {remelt: string, other: string}>}
 */
function buildAccreditationIdMapping(
  originalAccreditations,
  transformedAccreditations
) {
  const mapping = new Map()

  for (const original of originalAccreditations) {
    const needsSplitMapping =
      isGlassAccreditationNeedingMigration(original) &&
      hasBothGlassProcesses(original.glassRecyclingProcess)

    if (!needsSplitMapping) {
      continue
    }

    // Find the transformed accreditations for this original
    // These will always exist since transformGlassAccreditation produces both when splitting
    const remeltAcc = transformedAccreditations.find(
      (a) =>
        a.accreditationNumber ===
        replaceSuffix(original.accreditationNumber, GR_SUFFIX)
    )
    const otherAcc = transformedAccreditations.find(
      (a) =>
        a.accreditationNumber ===
        replaceSuffix(original.accreditationNumber, GO_SUFFIX)
    )

    mapping.set(original.id, {
      remelt: remeltAcc.id,
      other: otherAcc.id
    })
  }

  return mapping
}

/**
 * Update registration accreditationId references after accreditation split
 * @param {Object[]} registrations
 * @param {Map<string, {remelt: string, other: string}>} accreditationMapping
 * @returns {Object[]}
 */
function updateRegistrationAccreditationLinks(
  registrations,
  accreditationMapping
) {
  return registrations.map((reg) => {
    if (!reg.accreditationId) {
      return reg
    }

    const mapping = accreditationMapping.get(reg.accreditationId)
    if (!mapping) {
      return reg
    }

    // Link to the matching glass process type
    if (reg.glassRecyclingProcess?.includes(GLASS_RE_MELT)) {
      return { ...reg, accreditationId: mapping.remelt }
    }
    if (reg.glassRecyclingProcess?.includes(GLASS_OTHER)) {
      return { ...reg, accreditationId: mapping.other }
    }

    return reg
  })
}

/**
 * Migrate an organisation's glass registrations and accreditations
 * @param {Object} org
 * @returns {Object} Migrated organisation
 */
export function migrateOrganisation(org) {
  // Transform accreditations first (we need their new IDs for registration links)
  const transformedAccreditations = (org.accreditations || []).flatMap(
    transformGlassAccreditation
  )

  // Build mapping for split accreditations
  const accreditationMapping = buildAccreditationIdMapping(
    org.accreditations || [],
    transformedAccreditations
  )

  // Transform registrations
  const transformedRegistrations = (org.registrations || []).flatMap(
    transformGlassRegistration
  )

  // Update registration accreditationId links
  const linkedRegistrations = updateRegistrationAccreditationLinks(
    transformedRegistrations,
    accreditationMapping
  )

  return {
    ...org,
    registrations: linkedRegistrations,
    accreditations: transformedAccreditations
  }
}
