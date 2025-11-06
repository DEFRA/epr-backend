/**
 * @typedef {import('#domain/waste-records/model.js').WasteRecord} WasteRecord
 */

/**
 * @typedef {Object} WasteRecordsRepository
 * @property {(organisationId: string, registrationId: string) => Promise<WasteRecord[]>} findByRegistration
 * @property {(wasteRecords: WasteRecord[]) => Promise<void>} upsertWasteRecords
 */

/**
 * @typedef {() => WasteRecordsRepository} WasteRecordsRepositoryFactory
 */
