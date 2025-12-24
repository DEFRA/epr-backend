/** @import {UserRoles} from '#domain/organisations/model.js' */

/**
 * @typedef {{
 *   email: string
 *   fullName: string
 * }} User
 */

/**
 * @typedef {{
 *   email: string
 *   id: string
 * }} DefraIdLinkedBy
 */

/**
 * @typedef {{
 *   linkedAt: string
 *   linkedBy: DefraIdLinkedBy
 *   orgId: string
 *   orgName: string
 * }} DefraId
 */

/**
 * @typedef {{
 *   email: string
 *   fullName: string
 *   roles: UserRoles[]
 * }} OrganisationUser
 */

/**
 * Base organisation from transformation
 *
 * @typedef {{
 *   businessType?: string
 *   companyDetails: object
 *   defraId?: DefraId
 *   formSubmissionTime: Date
 *   id: string
 *   managementContactDetails?: User
 *   orgId: number
 *   partnership?: object
 *   reprocessingNations?: string[]
 *   submitterContactDetails: User
 *   submittedToRegulator: string
 *   wasteProcessingTypes: string[]
 * }} BaseOrganisation
 */

/**
 * @typedef {{
 *   accreditationId?: string
 *   approvedPersons: User[]
 *   cbduNumber: string
 *   exportPorts?: string[]
 *   formSubmissionTime: Date
 *   glassRecyclingProcess?: string
 *   id: string
 *   material: string
 *   noticeAddress?: object
 *   orgId: number
 *   orgName: string
 *   orsFileUploads?: object[]
 *   plantEquipmentDetails?: string
 *   reprocessingType?: string
 *   samplingInspectionPlanPart1FileUploads?: object[]
 *   site?: object
 *   submitterContactDetails: User
 *   submittedToRegulator: string
 *   suppliers?: string
 *   systemReference: string
 *   wasteManagementPermits?: object[]
 *   wasteProcessingType: string
 *   yearlyMetrics?: object[]
 * }} Registration
 */

/**
 * @typedef {{
 *   formSubmissionTime: Date
 *   glassRecyclingProcess?: string
 *   id: string
 *   material: string
 *   orgId: number
 *   orgName: string
 *   orsFileUploads?: object[]
 *   prnIssuance?: {signatories?: User[]}
 *   reprocessingType?: string
 *   samplingInspectionPlanPart2FileUploads?: object[]
 *   site?: object
 *   submitterContactDetails: User
 *   submittedToRegulator: string
 *   systemReference: string
 *   wasteProcessingType: string
 * }} Accreditation
 */

/**
 * Union type for Registration or Accreditation
 *
 * @typedef {Registration | Accreditation} RegistrationOrAccreditation
 */

/**
 * Organisation with linked registrations
 *
 * @typedef {BaseOrganisation & {registrations?: Registration[]}} OrganisationWithRegistrations
 */

/**
 * Organisation with linked registrations and accreditations
 *
 * @typedef {OrganisationWithRegistrations & {accreditations?: Accreditation[]}} Organisation
 */

/**
 * Organisation migration item with operation type
 *
 * @typedef {{
 *   value: Organisation
 *   operation: 'insert' | 'update'
 * }} OrganisationMigrationItem
 */

/**
 * Organisation map entry tuple [orgId, organisation]
 *
 * @typedef {[string, Organisation]} OrganisationMapEntry
 */

/**
 * Successful migration result
 *
 * @typedef {{
 *   success: true
 *   id: string
 *   action: 'inserted' | 'updated'
 * }} SuccessResult
 */

/**
 * Failed migration result
 *
 * @typedef {{
 *   success: false
 *   id: string
 *   phase: string
 * }} FailureResult
 */

/**
 * Migration result (success or failure)
 *
 * @typedef {SuccessResult | FailureResult} MigrationResult
 */

/**
 * Transformed submissions result
 *
 * @typedef {{
 *   organisations: BaseOrganisation[]
 *   registrations: Registration[]
 *   accreditations: Accreditation[]
 * }} TransformedSubmissions
 */

/**
 * Submission IDs with total count
 *
 * @typedef {import('#repositories/form-submissions/port.js').FormSubmissionIds & {
 *   totalCount: number
 * }} SubmissionIdsWithCount
 */

/**
 * Migration delta result containing migrated and pending submissions
 *
 * @typedef {{
 *   migrated: SubmissionIdsWithCount
 *   pendingMigration: SubmissionIdsWithCount
 * }} MigrationDelta
 */

/**
 * Form data migrator interface
 *
 * @typedef {{
 *   migrate: () => Promise<void>
 * }} FormDataMigrator
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
