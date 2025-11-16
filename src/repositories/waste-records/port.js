/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 * @typedef {import('#domain/waste-records/model.js').WasteRecordVersion} WasteRecordVersion
 * @typedef {import('#domain/waste-records/model.js').WasteRecordType} WasteRecordType
 */

/**
 * @typedef {Object} VersionData
 * @property {Object} data - Current waste record data
 * @property {Omit<WasteRecordVersion, 'data'>} version - Version metadata (summaryLogId, versionTimestamp)
 */

/**
 * @typedef {Object} WasteRecordsRepository
 * @property {(organisationId: string, registrationId: string) => Promise<WasteRecord[]>} findByRegistration
 * @property {(wasteRecords: WasteRecord[]) => Promise<void>} upsertWasteRecords
 * @property {(organisationId: string, registrationId: string, versionsByType: Map<WasteRecordType, Map<string, VersionData>>) => Promise<void>} appendVersions
 */

/**
 * @typedef {() => WasteRecordsRepository} WasteRecordsRepositoryFactory
 */
