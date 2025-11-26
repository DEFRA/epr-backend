import { describe, it, expect } from 'vitest'
import {
  postCodeForLogging,
  normalizePostcode,
  comparePostcodes
} from './postcode.js'

describe('normalizePostcode', () => {
  it('removes spaces and converts to uppercase', () => {
    expect(normalizePostcode('W1B 1NT')).toBe('W1B1NT')
  })

  it('handles postcodes with multiple spaces', () => {
    expect(normalizePostcode('   W1b   1NT  ')).toBe('W1B1NT')
  })

  it('handles empty string', () => {
    expect(normalizePostcode('')).toBe('')
  })

  it('handles null/undefined with optional chaining', () => {
    expect(normalizePostcode(null)).toBeUndefined()
    expect(normalizePostcode(undefined)).toBeUndefined()
  })
})

describe('postCodeForLogging', () => {
  it('generates consistent SHA-256 hash for same postcode', () => {
    const hash1 = postCodeForLogging('W1B 1NT')
    const hash2 = postCodeForLogging('W1B 1NT')
    expect(hash1).toBe(hash2)
  })

  it('normalizes postcodes before hashing', () => {
    const hash1 = postCodeForLogging('W1B 1NT')
    const hash2 = postCodeForLogging('W1B1NT')
    const hash3 = postCodeForLogging('   W1b   1NT  ')
    expect(hash1).toBe(hash2)
    expect(hash1).toBe(hash3)
  })

  it('generates different hashes for different postcodes', () => {
    const hash1 = postCodeForLogging('W1B 1NT')
    const hash2 = postCodeForLogging('W1C 1NT')
    expect(hash1).not.toBe(hash2)
  })

  it('returns empty string for empty postcode', () => {
    expect(postCodeForLogging('')).toBe('')
  })

  it('returns input for null/undefined', () => {
    expect(postCodeForLogging(null)).toBeNull()
    expect(postCodeForLogging(undefined)).toBeUndefined()
  })

  it('returns 64-character hex string', () => {
    const hash = postCodeForLogging('W1B 1NT')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('comparePostcodes', () => {
  it('returns true for equivalent postcodes with different spacing', () => {
    expect(comparePostcodes('W1B 1NT', 'W1B1NT')).toBe(true)
    expect(comparePostcodes('W1B 1NT', '   W1b   1NT  ')).toBe(true)
  })

  it('returns false for different postcodes', () => {
    expect(comparePostcodes('W1B 1NT', 'W1C 1NT')).toBe(false)
  })

  it('returns false when either postcode is empty/null/undefined', () => {
    expect(comparePostcodes('', 'W1B 1NT')).toBe(false)
    expect(comparePostcodes('W1B 1NT', '')).toBe(false)
    expect(comparePostcodes(null, 'W1B 1NT')).toBe(false)
    expect(comparePostcodes('W1B 1NT', null)).toBe(false)
    expect(comparePostcodes(undefined, 'W1B 1NT')).toBe(false)
    expect(comparePostcodes('W1B 1NT', undefined)).toBe(false)
  })

  it('returns true for same postcodes', () => {
    expect(comparePostcodes('W1B 1NT', 'W1B 1NT')).toBe(true)
  })
})
