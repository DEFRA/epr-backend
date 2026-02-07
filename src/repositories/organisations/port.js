/** @import {User, Organisation} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *  id: string
 * }} Id

/**
 * @typedef {{
 *  line1?: string;
 *  line2?: string;
 *  town?: string;
 *  county?: string;
 *  country?: string;
 *  postcode?: string;
 *  region?: string;
 *  fullAddress?: string;
 * }} RegistrationAddress
 */

/**
 * @typedef {{
 *  line1: string;
 *  postcode: string;
 * }} AccreditationAddress
 */

/**
 * @typedef {{
 *  address: AccreditationAddress;
 * }} AccreditationSite
 */

/**
 * @typedef {{
 *  capacity: number;
 *  material: string;
 *  siteCapacityTimescale: string;
 * }} SiteCapacity
 */

/**
 * @typedef {{
 *  address: RegistrationAddress;
 *  gridReference: string;
 *  siteCapacity: SiteCapacity[];
 * }} RegistrationSite
 */

/**
 * @typedef {{
 *  detailedExplanation: string;
 *  percentIncomeSpent: number;
 *  usageDescription: string;
 * }} PrnIncomeBusinessPlan
 */

/**
 * @typedef {{
 *  incomeBusinessPlan: PrnIncomeBusinessPlan[];
 *  signatories: User[];
 *  tonnageBand: string;
 * }} PrnIssuance
 */

/**
 * @typedef {Id & {
 *  formSubmissionTime: Date;
 *  material: string;
 *  prnIssuance: PrnIssuance;
 *  site?: AccreditationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 * }} AccreditationBase
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber: string;
 *  status: 'approved'|'suspended';
 *  validFrom: string;
 *  validTo: string
 * }} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber?: string;
 *  status: 'created'|'rejected'|'archived';
 *  validFrom?: string;
 *  validTo?: string
 * }} AccreditationOther
 */

/**
 * @typedef {AccreditationApproved | AccreditationOther} Accreditation
 */

/**
 * @typedef {Id & {
 *  accreditation?: Accreditation;
 *  accreditationId?: string;
 *  approvedPersons: User[]
 *  formSubmissionTime: Date;
 *  material: string;
 *  orgName: string;
 *  site: RegistrationSite;
 *  submittedToRegulator: string;
 *  submitterContactDetails: User;
 *  wasteProcessingType: string;
 * }} RegistrationBase
 */

/**
 * @typedef {RegistrationBase & {
 *  cbduNumber: string;
 *  status: 'approved'|'suspended';
 *  validFrom: string;
 *  validTo: string;
 * }} RegistrationApproved
 */

/**
 * @typedef {RegistrationBase & {
 *  cbduNumber?: string;
 *  status: 'created'|'rejected'|'archived';
 *  validFrom?: string;
 *  validTo?: string
 * }} RegistrationOther
 */

/**
 * @typedef {RegistrationApproved | RegistrationOther} Registration
 */

/**
 * @typedef {Object} OrganisationIds
 * @property {Set<string>} organisations - Set of organisation IDs
 * @property {Set<string>} registrations - Set of registration IDs
 * @property {Set<string>} accreditations - Set of accreditation IDs
 */

/**
 * Organisation replacement payload with identity fields removed.
 * Identity (id, version) is passed as separate parameters to replace().
 * @typedef {Partial<Omit<Organisation, 'id'|'version'|'schemaVersion'|'status'|'statusHistory'>>} OrganisationReplacement
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, replacement: OrganisationReplacement) => Promise<void>} replace
 * @property {() => Promise<Object[]>} findAll
 * @property {(ids: string[]) => Promise<Object[]>} findByIds - Find organisations by array of IDs
 * @property {(id: string, minimumVersion?: number) => Promise<Object|null>} findById
 * @property {(defraOrgId: string) => Promise<Organisation|null>} findByLinkedDefraOrgId - Find organisation linked to a Defra organisation ID
 * @property {(email: string) => Promise<Organisation[]>} findAllLinkableForUser - Find unlinked approved organisations where user is an initial user
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration|null>} findRegistrationById
 * @property {(organisationId: string, accreditationId: string, minimumOrgVersion?: number) => Promise<Accreditation>} findAccreditationById
 * @property {() => Promise<OrganisationIds>} findAllIds - Find all organisation, registration, and accreditation IDs
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
