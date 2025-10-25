# ExcelJS Parser Edge Cases Test Plan

This document tracks edge cases that need test coverage for the ExcelJS Summary Logs Parser.

## High Priority - Potential Bugs

### 1. Multiple Worksheets

**Issue**: Parser loops through all worksheets (line 154) but no test for multiple sheets
**Risk**: Metadata/data from different sheets might not merge correctly
**Test Needed**: Workbook with data in Sheet1 and Sheet2, verify both are parsed
**Status**: ✅ TESTED - metadata and data sections from multiple worksheets correctly merged into single result

### 2. Metadata Marker in Value Position

**Issue**: `__EPR_META_TYPE` in A1, but B1 has `__EPR_META_NAME` (another marker instead of value)
**Risk**: Marker appears where value should be - indicates malformed sheet
**Test Needed**: Row like `['__EPR_META_TYPE', '__EPR_META_NAME', 'name value']` should throw error
**Expected Behavior**: Throw error - marker in value position is malformed
**Status**: ✅ TESTED - throws error with message: 'Malformed sheet: metadata marker found in value position'

### 3. Multiple Metadata Markers on Same Row

**Issue**: Row like `['__EPR_META_TYPE', null, '__EPR_META_NAME']` - A1=TYPE, B1=null, C1=NAME marker
**Risk**: Second marker might overwrite metadataContext, first could be lost
**Test Needed**: Two metadata markers in same row with null between them
**Expected Behavior**: Record both - TYPE with null value at B1, NAME with value at D1
**Variations**: Also test with non-null between markers, and with/without D1 existing
**Status**: ✅ TESTED - both metadata markers correctly recorded with their respective values and locations

### 4. Multiple Data Sections with Same Name

**Issue**: Two `__EPR_DATA_UPDATE_WASTE_BALANCE` sections
**Risk**: Second silently overwrites first (line 136)
**Test Needed**: Two data sections with identical names
**Expected Behavior**: Throw error on duplicate data section names
**Status**: ✅ TESTED - throws error with message: 'Duplicate data section name: UPDATE_WASTE_BALANCE'
**Bug Found**: Yes - second section was silently overwriting the first. Fixed by adding validation in `emitCollectionsToResult`

### 5. Data Section Never Ends

**Issue**: No empty row before sheet ends
**Risk**: Line 225 should emit, but not verified
**Test Needed**: Data section that goes to last row without empty terminator
**Expected Behavior**: Data section emitted at end of sheet
**Status**: ✅ TESTED - data section correctly emitted at worksheet end (line 239 handles this)

### 6. Very Large Column Numbers (skip this one)

**Issue**: Tests go up to AA (27), but not AAA (703) or XFD (16384)
**Risk**: Algorithm untested for large columns
**Test Needed**: columnToLetter/letterToColumnNumber for AAA, XFD
**Status**: ❌ Not tested, unnecessary.

### 7. columnToLetter(0) or Negative Numbers (ignore)

**Issue**: 0 returns empty string, negatives cause infinite loop
**Risk**: Crash or wrong results
**Test Needed**: columnToLetter(0), columnToLetter(-1)
**Expected Behavior**: Throw error for invalid input
**Status**: ❌ Not tested

### 8. letterToColumnNumber('')

**Issue**: Empty string returns 0
**Risk**: Is this intended behavior?
**Test Needed**: letterToColumnNumber('')
**Expected Behavior**: Throw error for invalid input
**Status**: ✅ TESTED - throws error with message: 'Invalid column letter: empty string'
**Bug Found**: Yes - function was returning 0 for empty string. Fixed by adding validation that throws error for empty input

### 9. Lowercase Letters in letterToColumnNumber

**Issue**: Assumes uppercase (codePointAt - 64), lowercase gives wrong result
**Risk**: Silent failure, wrong column numbers
**Test Needed**: letterToColumnNumber('a'), letterToColumnNumber('aa')
**Expected Behavior**: Throw error
**Status**: ✅ TESTED - throws error with message: 'Invalid column letter: must be uppercase only'
**Bug Found**: Yes - function was accepting lowercase letters and producing incorrect column numbers. Fixed by adding regex validation `/^[A-Z]+$/` to ensure uppercase only

### 10. Markers Not in Column A

**Issue**: No enforcement that markers must be in column A
**Risk**: Metadata uses wrong cell as value, data has wrong startColumn
**Test Needed**: `__EPR_META_TYPE` in C3, `__EPR_DATA_X` in B4
**Expected Behavior**: Extract values correctly using respective value/startColumn
**Status**: ✅ TESTED - markers work correctly from any column position, with values/data extracted from column+1 offset

## Medium Priority - Edge Cases

### 11. Headers That Are Numbers

**Issue**: Line 81 uses cellValueStr, numbers converted to strings
**Risk**: Is this intentional?
**Test Needed**: Data section with numeric headers
**Expected Behavior**: Headers stored as strings of numbers
**Status**: ✅ TESTED - numeric headers (2024, 2025, 2026) correctly stored as strings ('2024', '2025', '2026')

### 12. Empty/Null Metadata Value

**Issue**: `__EPR_META_TYPE` followed by empty cell
**Risk**: Stores null or '' as value
**Test Needed**: Metadata marker with empty value cell
**Expected Behavior**: Store null or '' as metadata value
**Status**: ✅ TESTED - empty string ('') is stored for empty string cells, null is stored for explicitly null cells

### 13. Rows with More Cells Than Headers

**Issue**: Line 103 checks columnIndex < headers.length, extra cells ignored
**Risk**: Silent data loss
**Test Needed**: Row with 5 cells but only 3 headers
**Expected Behavior**: Extra cells ignored
**Status**: ✅ TESTED - extra cells beyond header count correctly ignored

### 14. Completely Empty Worksheet

**Issue**: If eachRow returns nothing
**Risk**: Should return empty result
**Test Needed**: Workbook with empty worksheet
**Expected Behavior**: Return empty metadata and no data sections
**Status**: ✅ TESTED - empty worksheet correctly returns empty metadata and no data sections

### 15. Formula Cells

**Issue**: ExcelJS might return formula or result
**Risk**: Unpredictable behavior
**Test Needed**: Cell with formula in metadata value and data row
**Expected Behavior**: Return evaluated result (if possible?)
**Status**: ✅ TESTED - formula cells with cached results return the result value, formulas without cached results return null

### 16. Date Cells

**Issue**: Excel dates stored as numbers
**Risk**: Need to verify handling
**Test Needed**: Date in metadata value and data row
**Expected Behavior**: Return date as JS Date object
**Status**: ✅ TESTED - Date objects correctly preserved in both metadata values and data rows

### 17. Multiple Data Sections on Same Row

**Issue**: `__EPR_DATA_ONE` in A1, `__EPR_DATA_TWO` in E1
**Risk**: Both added to activeCollections - does this work?
**Test Needed**: Two data markers on same row
**Expected Behavior**: Both data sections parsed correctly
**Status**: ✅ Already tested (side-by-side)

### 18. Skip Column Marker as First Header

**Issue**: `__EPR_SKIP_COLUMN` immediately after `__EPR_DATA_X`
**Risk**: First header is null
**Test Needed**: Skip marker in first position
**Expected Behavior**: First header is null, data aligns correctly
**Status**: ✅ TESTED - skip marker as first header correctly creates null in first position, data rows align correctly with headers

### 19. All Headers Are Skip Columns

**Issue**: Headers array full of nulls
**Risk**: No actual data columns
**Test Needed**: Data section with only skip columns
**Expected Behavior**: Data rows are filled with nulls
**Status**: ❌ Not tested

### 20. Partial Empty Rows

**Issue**: `[null, null, 'X']` - line 119 checks ALL null
**Risk**: Doesn't terminate section, is this correct?
**Test Needed**: Row with some nulls and some values
**Expected Behavior**: Row treated as data row, not terminator
**Status**: ❌ Not tested

## Testing Strategy

1. Work through high priority first (potential bugs)
2. Use TDD: RED (write failing test) → GREEN (minimal fix) → REFACTOR
3. Track progress in this document
4. Update status as tests are added
5. Document any bugs found and their fixes
