/**
 * Factory for creating row transformer functions.
 *
 * Every row transformer follows the same pattern: validate ROW_ID is present,
 * then return { wasteRecordType, rowId, data: { ...rowData, processingType } }.
 * This factory eliminates the need for 13 identical modules.
 *
 * @param {Object} params
 * @param {import('#domain/waste-records/model.js').WasteRecordType} params.wasteRecordType
 * @param {string} params.processingType
 * @param {string} params.rowIdField
 * @returns {(rowData: Record<string, any>, rowIndex: number) => { wasteRecordType: string, rowId: string, data: Record<string, any> }}
 */
export const createRowTransformer = ({
  wasteRecordType,
  processingType,
  rowIdField
}) => {
  return (rowData, rowIndex) => {
    if (!rowData[rowIdField]) {
      throw new Error(`Missing ${rowIdField} at row ${rowIndex}`)
    }

    return {
      wasteRecordType,
      rowId: rowData[rowIdField],
      data: {
        ...rowData,
        processingType
      }
    }
  }
}
