import {
  accreditationsForRegistration,
  resolveDetailedMaterial
} from '#domain/organisations/registration-utils.js'

/** @import { Organisation } from '#domain/organisations/model.js' */
/** @import { Registration, RegistrationSite } from '#domain/organisations/registration.js' */
/** @import { Accreditation } from '#domain/organisations/accreditation.js' */

/**
 * The registration as a client receives it, at the collection address and at
 * the member address alike. Both routes project through here, so the item a
 * client reads in a list is the resource it gets when it opens one.
 *
 * `application` is the applicant's own answers, kept as they gave them. A key
 * outside it carries something the applicant did not supply: the identity of
 * the resource, a decision a regulator made, or a value a process derived.
 * `material` is the one answer with both, so it appears in both places — the
 * applicant's below, the resolved one above. A registration that has not
 * resolved to a material has none of its own, so the top-level key is absent
 * rather than null, and `application.material` is what a client reads instead.
 *
 * @param {Registration} registration
 * @param {Organisation} organisation
 */
export function toRegistrationResource(registration, organisation) {
  const material = resolveDetailedMaterial(registration)

  return {
    id: registration.id,
    organisation: { id: organisation.id },
    registrationNumber: registration.registrationNumber ?? null,
    status: registration.status,
    ...(material !== null && { material }),
    reprocessingType: registration.reprocessingType ?? null,
    dateRange: toRegistrationDateRangeResource(registration),
    accreditations: accreditationsForRegistration(
      registration,
      organisation
    ).map(toAccreditationLink),
    application: {
      orgName: registration.orgName,
      submittedToRegulator: registration.submittedToRegulator,
      material: registration.material,
      wasteProcessingType: registration.wasteProcessingType,
      cbduNumber: registration.cbduNumber ?? null,
      suppliers: registration.suppliers,
      plantEquipmentDetails: registration.plantEquipmentDetails ?? null,
      site: toSiteResource(registration.site),
      wastePermits: registration.wasteManagementPermits ?? [],
      noticeAddress: registration.noticeAddress ?? null,
      exportPorts: registration.exportPorts ?? null
    }
  }
}

/**
 * The registrations an organisation holds, in the order the collection
 * promises: by the number the public register publishes, with the ones that
 * hold no number yet after every one that does, and the id settling a tie so
 * the order is total.
 *
 * @param {Organisation} organisation
 */
export function toRegistrationsResource(organisation) {
  return organisation.registrations
    .map((registration) => toRegistrationResource(registration, organisation))
    .sort(
      (left, right) =>
        compareUnnumberedLast(
          left.registrationNumber,
          right.registrationNumber
        ) || left.id.localeCompare(right.id)
    )
}

/**
 * @param {string | null} left
 * @param {string | null} right
 */
function compareUnnumberedLast(left, right) {
  if (left === right) {
    return 0
  }
  if (left === null) {
    return 1
  }
  if (right === null) {
    return -1
  }
  return left.localeCompare(right)
}

/**
 * Enough of the accreditation to address it and to say what state it is in,
 * and no more: its own content stays at its own address. Every accreditation
 * the registration holds appears, whatever its status, because a cancelled one
 * is a fact about the registration rather than something to hide.
 *
 * @param {Accreditation} accreditation
 */
function toAccreditationLink(accreditation) {
  return {
    id: accreditation.id,
    accreditationNumber: accreditation.accreditationNumber ?? null,
    status: accreditation.status
  }
}

/**
 * @param {{ validFrom?: string | null }} record
 */
function toRegistrationDateRangeResource({ validFrom }) {
  return {
    validFrom: validFrom ?? null
  }
}

/**
 * @param {{ validFrom?: string | null, validTo?: string | null }} record
 */
export function toDateRangeResource({ validFrom, validTo }) {
  return {
    validFrom: validFrom ?? null,
    validTo: validTo ?? null
  }
}

/**
 * @param {RegistrationSite | null | undefined} site
 */
function toSiteResource(site) {
  if (!site) {
    return null
  }

  return {
    address: site.address,
    gridReference: site.gridReference,
    capacity: site.siteCapacity.map((entry) => ({
      material: entry.material,
      tonnes: entry.siteCapacityInTonnes,
      timescale: entry.siteCapacityTimescale
    }))
  }
}
