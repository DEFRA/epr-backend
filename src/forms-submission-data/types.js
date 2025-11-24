/**
 * @typedef {Object} User
 * @property {string} fullName
 * @property {string} email
 */

/**
 * @typedef {Object} DefraIdLinkedBy
 * @property {string} email
 * @property {string} id
 */

/**
 * @typedef {Object} DefraId
 * @property {string} orgId
 * @property {string} orgName
 * @property {DefraIdLinkedBy} linkedBy
 * @property {string} linkedAt
 */

/**
 * @typedef {Object} OrganisationUser
 * @property {string} fullName
 * @property {string} email
 * @property {boolean} isInitialUser
 * @property {string[]} roles
 */

/**
 * Base organisation from transformation
 *
 * @typedef {Object} BaseOrganisation
 * @property {string} id
 * @property {number} orgId
 * @property {string[]} wasteProcessingTypes
 * @property {string[]} [reprocessingNations]
 * @property {string} [businessType]
 * @property {object} companyDetails
 * @property {object} [partnership]
 * @property {User} submitterContactDetails
 * @property {User} [managementContactDetails]
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 * @property {DefraId} [defraId]
 */

/**
 * @typedef {Object} Registration
 * @property {string} id
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 * @property {number} orgId
 * @property {string} systemReference
 * @property {string} orgName
 * @property {User} submitterContactDetails
 * @property {string} cbduNumber
 * @property {string} material
 * @property {string} [glassRecyclingProcess]
 * @property {string} wasteProcessingType
 * @property {User[]} approvedPersons
 * @property {object} [site]
 * @property {object} [noticeAddress]
 * @property {string} [suppliers]
 * @property {string[]} [exportPorts]
 * @property {string} [plantEquipmentDetails]
 * @property {object[]} [wasteManagementPermits]
 * @property {object[]} [samplingInspectionPlanPart1FileUploads]
 * @property {object[]} [orsFileUploads]
 * @property {object[]} [yearlyMetrics]
 */

/**
 * @typedef {Object} Accreditation
 * @property {string} id
 * @property {Date} formSubmissionTime
 * @property {string} submittedToRegulator
 * @property {number} orgId
 * @property {string} systemReference
 * @property {string} orgName
 * @property {User} submitterContactDetails
 * @property {string} material
 * @property {string} [glassRecyclingProcess]
 * @property {string} wasteProcessingType
 * @property {object} [prnIssuance]
 * @property {User[]} [prnIssuance.signatories]
 * @property {object[]} [samplingInspectionPlanPart2FileUploads]
 * @property {object[]} [orsFileUploads]
 */

/**
 * Organisation with linked registrations
 *
 * @typedef {BaseOrganisation & {registrations?: Registration[]}} OrganisationWithRegistrations
 */

/**
 * Organisation with linked registrations and accreditations
 *
 * @typedef {OrganisationWithRegistrations & {accreditations?: Accreditation[]}} OrganisationWithAccreditations
 */

/**
 * Complete organisation with collated users
 *
 * @typedef {OrganisationWithAccreditations & {users?: OrganisationUser[]}} Organisation
 */

export {}
