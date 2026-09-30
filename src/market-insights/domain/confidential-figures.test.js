import { isConfidential } from './confidential-figures.js'

describe('a confidential row', () => {
  it.each([1, 2])(
    'is one with %i operators accredited, whether or not it holds data',
    (operatorCount) => {
      expect(isConfidential({ operatorCount }, false)).toBe(true)
      expect(isConfidential({ operatorCount }, true)).toBe(true)
    }
  )

  it.each([3, 4])(
    'is not one with %i operators accredited, whether or not it holds data',
    (operatorCount) => {
      expect(isConfidential({ operatorCount }, false)).toBe(false)
      expect(isConfidential({ operatorCount }, true)).toBe(false)
    }
  )

  it('is one with no operator accredited that still holds data', () => {
    expect(isConfidential({ operatorCount: 0 }, true)).toBe(true)
  })

  it('is not one with no operator accredited and nothing in it', () => {
    expect(isConfidential({ operatorCount: 0 }, false)).toBe(false)
  })
})
