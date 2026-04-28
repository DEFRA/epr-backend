import {
  coerceWasteRecordData,
  coerceWasteRecordsForRead
} from './coerce-waste-record.js'

describe('coerceWasteRecordData', () => {
  it('coerces a numeric supplier name to a string', () => {
    expect(coerceWasteRecordData({ SUPPLIER_NAME: 0 })).toEqual({
      SUPPLIER_NAME: '0'
    })
  })

  it('coerces every known string field that holds a number', () => {
    const input = {
      SUPPLIER_NAME: 0,
      SUPPLIER_ADDRESS: 1,
      SUPPLIER_POSTCODE: 12345,
      SUPPLIER_EMAIL: 0,
      SUPPLIER_PHONE_NUMBER: 7700900123,
      ACTIVITIES_CARRIED_OUT_BY_SUPPLIER: 0,
      YOUR_REFERENCE: 42,
      WEIGHBRIDGE_TICKET: 99,
      CARRIER_NAME: 0,
      CBD_REG_NUMBER: 100,
      CARRIER_VEHICLE_REGISTRATION_NUMBER: 0,
      FINAL_DESTINATION_NAME: 0,
      FINAL_DESTINATION_ADDRESS: 0,
      FINAL_DESTINATION_POSTCODE: 0,
      FINAL_DESTINATION_EMAIL: 0,
      FINAL_DESTINATION_PHONE: 0,
      FINAL_DESTINATION_FACILITY_TYPE: 0
    }

    const result = coerceWasteRecordData(input)

    for (const [key, value] of Object.entries(input)) {
      expect(result[key]).toBe(String(value))
    }
  })

  it('passes string values through untouched', () => {
    expect(coerceWasteRecordData({ SUPPLIER_NAME: 'Acme Ltd' })).toEqual({
      SUPPLIER_NAME: 'Acme Ltd'
    })
  })

  it('passes null and undefined through untouched', () => {
    expect(
      coerceWasteRecordData({
        SUPPLIER_NAME: null,
        SUPPLIER_EMAIL: undefined
      })
    ).toEqual({ SUPPLIER_NAME: null, SUPPLIER_EMAIL: undefined })
  })

  it('does not coerce numeric values for fields not in the string set', () => {
    expect(coerceWasteRecordData({ NET_WEIGHT: 850, ROW_ID: 10000 })).toEqual({
      NET_WEIGHT: 850,
      ROW_ID: 10000
    })
  })

  it('preserves field order and includes all keys', () => {
    const input = { ROW_ID: 10000, SUPPLIER_NAME: 0, NET_WEIGHT: 850 }
    expect(Object.keys(coerceWasteRecordData(input))).toEqual([
      'ROW_ID',
      'SUPPLIER_NAME',
      'NET_WEIGHT'
    ])
  })
})

describe('coerceWasteRecordsForRead', () => {
  it('coerces each record’s data and preserves other fields', () => {
    const records = [
      { type: 'received', rowId: '10000', data: { SUPPLIER_NAME: 0 } },
      { type: 'received', rowId: '10001', data: { SUPPLIER_NAME: 'Acme' } }
    ]

    expect(coerceWasteRecordsForRead(records)).toEqual([
      { type: 'received', rowId: '10000', data: { SUPPLIER_NAME: '0' } },
      { type: 'received', rowId: '10001', data: { SUPPLIER_NAME: 'Acme' } }
    ])
  })

  it('does not mutate the input records', () => {
    const record = { data: { SUPPLIER_NAME: 0 } }
    coerceWasteRecordsForRead([record])
    expect(record.data.SUPPLIER_NAME).toBe(0)
  })
})
