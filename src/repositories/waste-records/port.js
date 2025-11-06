/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 */

/**
 * @typedef {Object} WasteRecordsRepository
 * @property {(organisationId: string, registrationId: string) => Promise<WasteRecord[]>} findAll
 * @property {(wasteRecords: WasteRecord[]) => Promise<void>} saveAll
 */

/**
 * @typedef {() => WasteRecordsRepository} WasteRecordsRepositoryFactory
 */
