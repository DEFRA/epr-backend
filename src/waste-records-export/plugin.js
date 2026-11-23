import { wasteRecordsExportRoute } from './routes/export.js'
import { registrationWasteRecordsExportByNumber } from './routes/registration-export.js'
import { availableWasteRecordYearsGet } from './routes/available-years.js'

/**
 * The waste records export module's Hapi plugin, which adds its routes.
 *
 * @module waste-records-export/plugin
 */
const wasteRecordsExport = {
  plugin: {
    name: 'waste-records-export',
    register: (server) => {
      server.route([
        wasteRecordsExportRoute,
        registrationWasteRecordsExportByNumber,
        availableWasteRecordYearsGet
      ])
    }
  }
}

export { wasteRecordsExport }
