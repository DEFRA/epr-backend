/** @import {User} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *  id: string
 * }} Id
 */

/**
 * @typedef {Id & {
 *  formSubmissionTime: Date;
 *  material: string;
 *  submittedToRegulator: string;
 *  wasteProcessingType: string;
 * }} AccreditationBase
 */

/**
 * @typedef {AccreditationBase & {status: 'approved'|'suspended', accreditationNumber: string, validFrom: Date, validTo: Date}} AccreditationApproved
 */

/**
 * @typedef {AccreditationBase & {status: 'created'|'rejected'|'archived', accreditationNumber?: string, validFrom?: Date, validTo?: Date}} AccreditationOther
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
