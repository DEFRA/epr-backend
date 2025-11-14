/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#domain/waste-records/model.js').WasteRecordVersion} WasteRecordVersion
 * @typedef {import('#domain/waste-records/model.js').WasteRecordType} WasteRecordType
 */

/**
 * @typedef {Object} VersionData
 * @property {Record<string, unknown>} data - Current computed state of waste record data
 * @property {WasteRecordVersion} version - Version entry including delta or full data
 */

/**
 * @typedef {Object} WasteRecordsRepository
 * @property {(organisationId: string, registrationId: string) => Promise<WasteRecord[]>} findByRegistration
 * @property {(organisationId: string, registrationId: string, versionsByType: Map<WasteRecordType, Map<string, VersionData>>) => Promise<void>} appendVersions
 */

/**
 * @typedef {() => WasteRecordsRepository} WasteRecordsRepositoryFactory
 */
