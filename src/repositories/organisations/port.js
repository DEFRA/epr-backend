/** @import {User} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *  id: string
 * }} Id

/**
 * Full address used in registrations
 * @typedef {Object} RegistrationAddress
 * @property {string} [line1]
 * @property {string} [line2]
 * @property {string} [town]
 * @property {string} [county]
 * @property {string} [country]
 * @property {string} [postcode]
 * @property {string} [region]
 * @property {string} [fullAddress]
 */

/**
 * Minimal address used in accreditations (only line1 and postcode required)
 * @typedef {Object} AccreditationAddress
 * @property {string} line1
 * @property {string} postcode
 */

/**
 * @typedef {Object} AccreditationSite
 * @property {AccreditationAddress} address
 */

/**
 * @typedef {Object} SiteCapacity
 * @property {string} material
 * @property {number} capacity
 * @property {string} siteCapacityTimescale
 */

/**
 * @typedef {Object} RegistrationSite
 * @property {RegistrationAddress} address
 * @property {string} gridReference
 * @property {SiteCapacity[]} siteCapacity
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
 *  validFrom: Date;
 *  validTo: Date
 * }} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {
 *  accreditationNumber?: string;
 *  status: 'created'|'rejected'|'archived';
 *  validFrom?: Date;
 *  validTo?: Date
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
 *  validFrom: Date;
 *  validTo: Date;
 * }} RegistrationApproved
 */

/**
 * @typedef {RegistrationBase & {
 *  cbduNumber?: string;
 *  status: 'created'|'rejected'|'archived';
 *  validFrom?: Date;
 *  validTo?: Date
 * }} RegistrationOther
 */

/**
 * @typedef {RegistrationApproved | RegistrationOther} Registration
 */

/**
 * @typedef {Object} UpsertResult
 * @property {'inserted'|'updated'|'unchanged'} action
 * @property {string} id
 */

/**
 * @typedef {Object} OrganisationsRepository
 * @property {(organisation: Object) => Promise<void>} insert
 * @property {(id: string, version: number, updates: Object) => Promise<void>} update
 * @property {(organisation: Object) => Promise<UpsertResult>} upsert
 * @property {() => Promise<Object[]>} findAll
 * @property {(id: string, minimumVersion?: number) => Promise<Object|null>} findById
 * @property {(organisationId: string, registrationId: string, minimumOrgVersion?: number) => Promise<Registration|null>} findRegistrationById
 */

/**
 * @typedef {() => OrganisationsRepository} OrganisationsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
