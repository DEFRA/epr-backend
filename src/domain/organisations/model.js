/** @import {Accreditation, Registration} from '#repositories/organisations/port.js' */

/**
 * Status values for registrations and accreditations
 * @typedef {typeof REG_ACC_STATUS[keyof typeof REG_ACC_STATUS]} RegAccStatus
 */
export const REG_ACC_STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
})

export const ORGANISATION_STATUS = Object.freeze({
  CREATED: 'created',
  APPROVED: 'approved',
  ACTIVE: 'active',
  REJECTED: 'rejected'
})

export const REGULATOR = Object.freeze({
  EA: 'ea',
  NRW: 'nrw',
  SEPA: 'sepa',
  NIEA: 'niea'
})

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
 * @typedef {'reprocessor' | 'exporter'} WasteProcessingTypeValue
 */

export const WASTE_PROCESSING_TYPE = Object.freeze({
  REPROCESSOR: 'reprocessor',
  EXPORTER: 'exporter'
})

/**
 * @typedef {'input' | 'output'} ReprocessingType
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

export const PARTNERSHIP_TYPE = Object.freeze({
  LTD: 'ltd',
  LTD_LIABILITY: 'ltd_liability'
})

export const TIME_SCALE = Object.freeze({
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
})

export const WASTE_PERMIT_TYPE = Object.freeze({
  ENVIRONMENTAL_PERMIT: 'environmental_permit',
  INSTALLATION_PERMIT: 'installation_permit',
  WASTE_EXEMPTION: 'waste_exemption'
})

export const GLASS_RECYCLING_PROCESS = Object.freeze({
  GLASS_RE_MELT: 'glass_re_melt',
  GLASS_OTHER: 'glass_other'
})

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
 *   linkedAt: Date;
 *   linkedBy: {
 *     email: string
 *     id: string
 *   }
 * }} LinkedDefraOrganisation
 */

/**
 * @typedef {'ea'|'niea'|'nrw'|'sepa'} RegulatorValue
 */

/**
 * @typedef {'individual'|'partnership'|'unincorporated'} BusinessTypeValue
 */

/**
 * @typedef {'england'|'northern_ireland'|'scotland'|'wales'} NationValue
 */

/**
 * @typedef {{
 *   status: RegAccStatus;
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
 *   type: 'ltd'|'ltd_liability';
 *   partners?: Partner[];
 * }} Partnership
 */

/**
 * @typedef {{
 *   id: string;
 *   accreditations?: Accreditation[];
 *   businessType?: BusinessTypeValue;
 *   companyDetails: CompanyDetails;
 *   formSubmissionTime: Date;
 *   linkedDefraOrganisation?: LinkedDefraOrganisation;
 *   managementContactDetails?: User;
 *   orgId: number;
 *   partnership?: Partnership;
 *   registrations?: Registration[];
 *   reprocessingNations?: NationValue[];
 *   schemaVersion: number;
 *   status: Status;
 *   statusHistory: StatusHistoryItem[];
 *   submittedToRegulator: RegulatorValue;
 *   submitterContactDetails: User;
 *   users: CollatedUser[];
 *   version: number;
 *   wasteProcessingTypes: WasteProcessingTypeValue[];
 * }} Organisation
 */
