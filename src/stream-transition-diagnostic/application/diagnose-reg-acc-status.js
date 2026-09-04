import {
  ACCREDITATION_STATUS,
  REGISTRATION_STATUS
} from '#domain/organisations/model.js'

import {
  formatStatusHistory,
  occurrencesOf,
  linkingRegistration
} from './shared.js'

/** @import {Organisation} from '#domain/organisations/model.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */
/** @import {Accreditation} from '#domain/organisations/accreditation.js' */

/**
 * @typedef {Object} RegAccStatusReport
 * @property {string} organisationId
 * @property {number} orgId
 * @property {string} orgName
 * @property {'registration' | 'accreditation'} kind
 * @property {'currentlySuspended' | 'currentlyCancelled' | 'previously'} line
 * @property {string | null} registrationId
 * @property {string | null} registrationNumber
 * @property {string | null} accreditationId
 * @property {string | null} accreditationNumber
 * @property {string | null} currentStatus - only set on the 'previously' line
 * @property {number} suspensionCount
 * @property {number} cancellationCount
 * @property {string} registrationHistory
 * @property {string} accreditationHistory
 * @property {string | null} material
 */

/**
 * The trail-occurrence counts driving both selection and the report's
 * suspension/cancellation counts.
 *
 * @param {Registration | null} registration
 * @param {Accreditation | null} accreditation
 */
const trailOccurrences = (registration, accreditation) => ({
  regSuspended: occurrencesOf(
    registration?.statusHistory,
    // Registrations are never suspended; kept for symmetry, always zero.
    'suspended'
  ),
  accSuspended: occurrencesOf(
    accreditation?.statusHistory,
    ACCREDITATION_STATUS.SUSPENDED
  ),
  regCancelled: occurrencesOf(
    registration?.statusHistory,
    REGISTRATION_STATUS.CANCELLED
  ),
  accCancelled: occurrencesOf(
    accreditation?.statusHistory,
    ACCREDITATION_STATUS.CANCELLED
  )
})

/**
 * Picks the line/kind pair for a pair with at least one suspension or
 * cancellation in its combined history. Selection order: either currently
 * cancelled -> cancelled line; else accreditation currently suspended ->
 * suspended line; else -> previously line (the caller already knows the
 * combined history is non-empty).
 *
 * @param {string | null} currentRegStatus
 * @param {string | null} currentAccStatus
 * @param {ReturnType<typeof trailOccurrences>} occurrences
 * @returns {{ line: RegAccStatusReport['line'], kind: RegAccStatusReport['kind'] }}
 */
const selectLineAndKind = (
  currentRegStatus,
  currentAccStatus,
  { accSuspended, accCancelled }
) => {
  if (
    currentRegStatus === REGISTRATION_STATUS.CANCELLED ||
    currentAccStatus === ACCREDITATION_STATUS.CANCELLED
  ) {
    return {
      line: 'currentlyCancelled',
      kind:
        currentRegStatus === REGISTRATION_STATUS.CANCELLED
          ? 'registration'
          : 'accreditation'
    }
  }
  if (currentAccStatus === ACCREDITATION_STATUS.SUSPENDED) {
    return { line: 'currentlySuspended', kind: 'accreditation' }
  }
  return {
    line: 'previously',
    kind:
      accSuspended.everHeld || accCancelled.everHeld
        ? 'accreditation'
        : 'registration'
  }
}

/**
 * Assembles the report shape from already-decided fields. Split out purely
 * to keep classifyRegAccStatus's own cyclomatic complexity under Sonar's
 * threshold — every `?.`/`??` counts as a branch, and the field list here has
 * plenty of them.
 *
 * @param {{
 *   registration: Registration | null,
 *   accreditation: Accreditation | null,
 *   orgInfo: { organisationId: string, orgId: number, orgName: string },
 *   line: RegAccStatusReport['line'],
 *   kind: RegAccStatusReport['kind'],
 *   currentRegStatus: string | null,
 *   currentAccStatus: string | null,
 *   suspensionCount: number,
 *   cancellationCount: number
 * }} args
 * @returns {RegAccStatusReport}
 */
const buildRegAccStatusReport = ({
  registration,
  accreditation,
  orgInfo,
  line,
  kind,
  currentRegStatus,
  currentAccStatus,
  suspensionCount,
  cancellationCount
}) => ({
  organisationId: orgInfo.organisationId,
  orgId: orgInfo.orgId,
  orgName: orgInfo.orgName,
  kind,
  line,
  registrationId: registration?.id ?? null,
  registrationNumber: registration?.registrationNumber ?? null,
  accreditationId: accreditation?.id ?? null,
  accreditationNumber: accreditation?.accreditationNumber ?? null,
  currentStatus:
    line === 'previously' ? (currentAccStatus ?? currentRegStatus) : null,
  suspensionCount,
  cancellationCount,
  registrationHistory: formatStatusHistory(registration?.statusHistory),
  accreditationHistory: formatStatusHistory(accreditation?.statusHistory),
  material: registration?.material ?? accreditation?.material ?? null
})

/**
 * Classifies one registration/accreditation pair for the status sweep.
 * Selection checks BOTH trails, not just the trail of whichever item is
 * currently in that status — a registration cancelled by the cascade shares
 * its accreditation's cancellation, but an accreditation suspended alone has
 * no registration-side echo (registrations are never suspended, PAE-1705),
 * and an unlinked cancelled registration has no accreditation trail at all.
 *
 * @param {Registration | null} registration
 * @param {Accreditation | null} accreditation
 * @param {{ organisationId: string, orgId: number, orgName: string }} orgInfo
 * @returns {RegAccStatusReport | null}
 */
export const classifyRegAccStatus = (registration, accreditation, orgInfo) => {
  const occurrences = trailOccurrences(registration, accreditation)
  const suspensionCount =
    occurrences.regSuspended.count + occurrences.accSuspended.count
  const cancellationCount =
    occurrences.regCancelled.count + occurrences.accCancelled.count

  if (suspensionCount === 0 && cancellationCount === 0) {
    return null
  }

  const currentRegStatus = registration?.status ?? null
  const currentAccStatus = accreditation?.status ?? null
  const { line, kind } = selectLineAndKind(
    currentRegStatus,
    currentAccStatus,
    occurrences
  )

  return buildRegAccStatusReport({
    registration,
    accreditation,
    orgInfo,
    line,
    kind,
    currentRegStatus,
    currentAccStatus,
    suspensionCount,
    cancellationCount
  })
}

/**
 * @typedef {Object} RegAccStatusSummary
 * @property {number} organisations
 * @property {number} currentlySuspendedAccreditations
 * @property {number} currentlyCancelledAccreditations
 * @property {number} currentlyCancelledRegistrations
 * @property {number} previouslySuspendedNowApproved
 * @property {number} previouslyCancelledNowApproved
 * @property {number} totalSuspensionEvents
 * @property {number} totalCancellationEvents
 */

/**
 * Sweeps one organisation's registration/accreditation pairs, accreditation
 * side first (to reach ones no registration links) then any registration
 * left unvisited by that pass.
 *
 * @param {Organisation} org
 * @returns {RegAccStatusReport[]}
 */
const reportsForOrg = (org) => {
  const orgInfo = {
    organisationId: org.id,
    orgId: org.orgId,
    orgName: org.companyDetails?.name ?? null
  }
  const linkedAccreditationIds = new Set()

  const fromAccreditations = org.accreditations.flatMap((accreditation) => {
    const registration = linkingRegistration(accreditation, org)
    if (registration) {
      linkedAccreditationIds.add(accreditation.id)
    }
    const report = classifyRegAccStatus(registration, accreditation, orgInfo)
    return report ? [report] : []
  })

  const fromUnlinkedRegistrations = org.registrations
    .filter(
      (registration) =>
        !registration.accreditationId ||
        !linkedAccreditationIds.has(registration.accreditationId)
    )
    .flatMap((registration) => {
      const report = classifyRegAccStatus(registration, null, orgInfo)
      return report ? [report] : []
    })

  return [...fromAccreditations, ...fromUnlinkedRegistrations]
}

/**
 * @param {Organisation[]} organisations
 * @param {RegAccStatusReport[]} reports
 * @returns {RegAccStatusSummary}
 */
const summariseRegAccStatus = (organisations, reports) => ({
  organisations: organisations.length,
  currentlySuspendedAccreditations: reports.filter(
    (r) => r.line === 'currentlySuspended'
  ).length,
  currentlyCancelledAccreditations: reports.filter(
    (r) => r.line === 'currentlyCancelled' && r.kind === 'accreditation'
  ).length,
  currentlyCancelledRegistrations: reports.filter(
    (r) => r.line === 'currentlyCancelled' && r.kind === 'registration'
  ).length,
  previouslySuspendedNowApproved: reports.filter(
    (r) => r.line === 'previously' && r.suspensionCount > 0
  ).length,
  previouslyCancelledNowApproved: reports.filter(
    (r) => r.line === 'previously' && r.cancellationCount > 0
  ).length,
  totalSuspensionEvents: reports.reduce((sum, r) => sum + r.suspensionCount, 0),
  totalCancellationEvents: reports.reduce(
    (sum, r) => sum + r.cancellationCount,
    0
  )
})

/**
 * Sweeps every organisation's registration/accreditation pairs for ever-held
 * suspended/cancelled status. Iterates from `org.accreditations`, not
 * `org.registrations`: an accreditation unlinked from any registration
 * (the state the ORPHAN_ACCREDITATION validation rule already flags) would
 * be unreachable from the registration side. Registrations with no linked
 * accreditation are then swept separately so a cancelled-but-never-accredited
 * registration is not missed.
 *
 * @param {Organisation[]} organisations
 * @returns {{ reports: RegAccStatusReport[], summary: RegAccStatusSummary }}
 */
export const diagnoseRegAccStatus = (organisations) => {
  const reports = organisations.flatMap(reportsForOrg)
  return { reports, summary: summariseRegAccStatus(organisations, reports) }
}
