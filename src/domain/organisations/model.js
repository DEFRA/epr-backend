/** @import {Accreditation} from '#domain/organisations/accreditation.js' */
/** @import {Registration} from '#domain/organisations/registration.js' */

/**
 * @typedef {Registration | Accreditation} RegistrationOrAccreditation
 */

/**
 * Status values for registrations. A registration can never be suspended —
 * suspension is an accreditation-only concept (PAE-1705).
 * @typedef {typeof REGISTRATION_STATUS[keyof typeof REGISTRATION_STATUS]} RegistrationStatus
 */
export const REGISTRATION_STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected'
})

/**
 * Status values for accreditations
 * @typedef {typeof ACCREDITATION_STATUS[keyof typeof ACCREDITATION_STATUS]} AccreditationStatus
 */
export const ACCREDITATION_STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
})

/**
 * Union for code that is generic over registrations and accreditations
 * (status history, user collation).
 * @typedef {RegistrationStatus | AccreditationStatus} RegOrAccStatus
 */

/** @type {ReadonlySet<AccreditationStatus>} */
export const ACTIVE_ACCREDITATION_STATUSES = new Set([
  ACCREDITATION_STATUS.APPROVED,
  ACCREDITATION_STATUS.SUSPENDED
])

/**
 * Status values for organisations
 * @typedef {typeof ORGANISATION_STATUS[keyof typeof ORGANISATION_STATUS]} OrganisationStatus
 */
export const ORGANISATION_STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  ACTIVE: 'active',
  REJECTED: 'rejected'
})

/**
 * Organisation statuses from which an organisation can be linked to a Defra ID
 * organisation: freshly `approved`, or `active` but unlinked (e.g. after being
 * unlinked via the admin journey, allowing the user to re-link).
 * @type {readonly string[]}
 */
export const LINKABLE_ORGANISATION_STATUSES = Object.freeze([
  ORGANISATION_STATUS.APPROVED,
  ORGANISATION_STATUS.ACTIVE
])

export const REGULATOR = Object.freeze({
  EA: 'ea',
  NRW: 'nrw',
  SEPA: 'sepa',
  NIEA: 'niea'
})

export const REGULATOR_DISPLAY = Object.freeze({
  ea: 'EA',
  nrw: 'NRW',
  sepa: 'SEPA',
  niea: 'NIEA'
})

/**
 * @typedef {typeof MATERIAL[keyof typeof MATERIAL]} Material
 */
export const MATERIAL = Object.freeze({
  ALUMINIUM: 'aluminium',
  FIBRE: 'fibre',
  GLASS: 'glass',
  PAPER: 'paper',
  PLASTIC: 'plastic',
  STEEL: 'steel',
  WOOD: 'wood'
})

/**
 * @typedef {typeof WASTE_PROCESSING_TYPE[keyof typeof WASTE_PROCESSING_TYPE]} WasteProcessingTypeValue
 */
export const WASTE_PROCESSING_TYPE = Object.freeze({
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
})

/**
 * @typedef {typeof REPROCESSING_TYPE[keyof typeof REPROCESSING_TYPE]} ReprocessingType
 */
export const REPROCESSING_TYPE = Object.freeze({
  INPUT: 'input',
  OUTPUT: 'output'
})

export const NATION = Object.freeze({
  ENGLAND: 'england',
  WALES: 'wales',
  SCOTLAND: 'scotland',
  NORTHERN_IRELAND: 'northern_ireland'
})

export const BUSINESS_TYPE = Object.freeze({
  INDIVIDUAL: 'individual',
  UNINCORPORATED: 'unincorporated',
  PARTNERSHIP: 'partnership'
})

export const PARTNER_TYPE = Object.freeze({
  COMPANY: 'company',
  INDIVIDUAL: 'individual',
  CORPORATE: 'corporate'
})

/**
 * @typedef {typeof PARTNERSHIP_TYPE[keyof typeof PARTNERSHIP_TYPE]} PartnershipType
 */
export const PARTNERSHIP_TYPE = Object.freeze({
  LTD: 'ltd',
  LTD_LIABILITY: 'ltd_liability'
})

/**
 * @typedef {typeof TIME_SCALE[keyof typeof TIME_SCALE]} TimeScale
 */
export const TIME_SCALE = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
})

/**
 * @typedef {typeof WASTE_PERMIT_TYPE[keyof typeof WASTE_PERMIT_TYPE]} WastePermitType
 */
export const WASTE_PERMIT_TYPE = Object.freeze({
  ENVIRONMENTAL_PERMIT: 'environmental_permit',
  INSTALLATION_PERMIT: 'installation_permit',
  WASTE_EXEMPTION: 'waste_exemption'
})

/**
 * @typedef {typeof GLASS_RECYCLING_PROCESS[keyof typeof GLASS_RECYCLING_PROCESS]} GlassRecyclingProcess
 */
export const GLASS_RECYCLING_PROCESS = Object.freeze({
  GLASS_RE_MELT: 'glass_re_melt',
  GLASS_OTHER: 'glass_other'
})

/**
 * The material a record is for, once resolved. Glass is the only material that
 * sub-divides, so this is one of the six that do not, or one of the two glass
 * recycling processes. Plain `glass` is never a resolved material.
 * @typedef {Exclude<Material, 'glass'> | GlassRecyclingProcess} ResolvedMaterial
 */

/** @type {readonly ResolvedMaterial[]} */
export const TONNAGE_MONITORING_MATERIALS = Object.freeze([
  ...Object.values(MATERIAL).filter((m) => m !== MATERIAL.GLASS),
  ...Object.values(GLASS_RECYCLING_PROCESS)
])

/**
 * @typedef {typeof TONNAGE_BAND[keyof typeof TONNAGE_BAND]} TonnageBand
 */
export const TONNAGE_BAND = Object.freeze({
  UP_TO_500: 'up_to_500',
  UP_TO_5000: 'up_to_5000',
  UP_TO_10000: 'up_to_10000',
  OVER_10000: 'over_10000'
})

export const VALUE_TYPE = Object.freeze({
  ACTUAL: 'actual',
  ESTIMATED: 'estimated'
})

/**
 * @typedef {typeof USER_ROLES[keyof typeof USER_ROLES]} UserRoles
 */
export const USER_ROLES = Object.freeze({
  INITIAL: 'initial_user',
  STANDARD: 'standard_user'
})

/**
 * @typedef {{
 *   line1?: string;
 *   line2?: string;
 *   town?: string;
 *   county?: string;
 *   country?: string;
 *   postcode?: string;
 *   region?: string;
 *   fullAddress?: string;
 * }} Address
 */

/**
 * @typedef {{
 *   name: string;
 *   tradingName?: string;
 *   registrationNumber?: string;
 *   companiesHouseNumber?: string;
 *   registeredAddress?: Address;
 *   address?: Address;
 * }} CompanyDetails
 */

/**
 * @typedef {{
 *   fullName: string;
 *   email: string;
 *   phone: string;
 *   role?: string;
 *   title?: string;
 * }} User
 */

/**
 * @typedef {{
 *   contactId?: string;
 *   fullName: string;
 *   email: string;
 *   roles: UserRoles[];
 * }} CollatedUser
 */

/**
 * @typedef {{
 *   orgId: string;
 *   orgName: string;
 *   linkedAt: string;
 *   linkedBy: {
 *     email: string
 *     id: string
 *   }
 * }} LinkedDefraOrganisation
 */

/**
 * @typedef {typeof REGULATOR[keyof typeof REGULATOR]} RegulatorValue
 */

/**
 * @typedef {typeof REGULATOR_DISPLAY[keyof typeof REGULATOR_DISPLAY]} RegulatorDisplay
 */

/**
 * @typedef {typeof BUSINESS_TYPE[keyof typeof BUSINESS_TYPE]} BusinessTypeValue
 */

/**
 * @typedef {typeof NATION[keyof typeof NATION]} NationValue
 */

/**
 * @typedef {{
 *   status: RegOrAccStatus;
 *   updatedAt: Date;
 *   updatedBy?: string;
 * }} StatusHistoryItem
 */

/**
 * @typedef {{
 *   name: string;
 *   type: 'company'|'individual';
 * }} Partner
 */

/**
 * @typedef {{
 *   type: PartnershipType;
 *   partners?: Partner[];
 * }} Partnership
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditations: Accreditation[];
 *   businessType?: BusinessTypeValue;
 *   companyDetails: CompanyDetails;
 *   formSubmission: { id: string; time: Date };
 *   linkedDefraOrganisation?: LinkedDefraOrganisation;
 *   managementContactDetails?: User;
 *   orgId: number;
 *   partnership?: Partnership;
 *   registrations: Registration[];
 *   reprocessingNations?: NationValue[];
 *   schemaVersion: number;
 *   status: OrganisationStatus;
 *   statusHistory: StatusHistoryItem[];
 *   submittedToRegulator: RegulatorValue;
 *   submitterContactDetails: User;
 *   users: CollatedUser[];
 *   version: number;
 *   wasteProcessingTypes: WasteProcessingTypeValue[];
 * }} Organisation
 */
