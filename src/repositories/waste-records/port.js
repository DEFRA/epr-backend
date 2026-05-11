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
 * @property {(organisationId: string, registrationId: string, wasteRecordVersions: Map<WasteRecordType, Map<string, VersionData>>) => Promise<void>} appendVersions
 * @property {() => Promise<string[]>} findDistinctDataKeys - Returns the union of all keys observed on `record.data` across every record in the collection. Used by the CSV export to compose its header without materialising every document into memory.
 */

/**
 * @typedef {() => WasteRecordsRepository} WasteRecordsRepositoryFactory
 */

export {} // NOSONAR: javascript:S7787 - Required to make this file a module for JSDoc @import
