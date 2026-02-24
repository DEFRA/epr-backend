import { Decimal128 } from 'mongodb'
import { toDecimalString } from '#domain/decimal-utils.js'

const TONNAGE_FIELD_PATTERN = /(tonnage|weight)/i

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const isDecimal128 = (value) =>
  value && typeof value === 'object' && value._bsontype === 'Decimal128'

const toMongoPersistedValue = (key, value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (TONNAGE_FIELD_PATTERN.test(key)) {
      return Decimal128.fromString(toDecimalString(value))
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isPlainObject(item)) {
        return mapObjectForMongoPersistence(item)
      }
      return item
    })
  }

  if (isPlainObject(value)) {
    return mapObjectForMongoPersistence(value)
  }

  return value
}

const mapObjectForMongoPersistence = (data) => {
  if (!isPlainObject(data)) {
    return data
  }

  const mapped = {}
  for (const [key, value] of Object.entries(data)) {
    mapped[key] = toMongoPersistedValue(key, value)
  }

  return mapped
}

const fromMongoValue = (value) => {
  if (isDecimal128(value)) {
    return Number(value.toString())
  }

  if (Array.isArray(value)) {
    return value.map(fromMongoValue)
  }

  if (isPlainObject(value)) {
    return mapMongoDocumentToDomain(value)
  }

  return value
}

export const mapMongoDocumentToDomain = (data) => {
  if (!isPlainObject(data)) {
    return data
  }

  const mapped = {}
  for (const [key, value] of Object.entries(data)) {
    mapped[key] = fromMongoValue(value)
  }

  return mapped
}

export const mapVersionDataForMongoPersistence = (versionData) => {
  if (!versionData) {
    return versionData
  }

  return {
    ...versionData,
    data: mapObjectForMongoPersistence(versionData.data),
    version: {
      ...versionData.version,
      data: mapObjectForMongoPersistence(versionData.version?.data)
    }
  }
}
