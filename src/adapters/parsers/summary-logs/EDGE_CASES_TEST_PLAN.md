# ExcelJS Parser Edge Cases Test Plan

This document tracks edge cases that need test coverage for the ExcelJS Summary Logs Parser.

## High Priority - Potential Bugs

### 1. Multiple Worksheets

**Issue**: Parser loops through all worksheets (line 154) but no test for multiple sheets
**Risk**: Metadata/data from different sheets might not merge correctly
**Test Needed**: Workbook with data in Sheet1 and Sheet2, verify both are parsed
**Status**: ❌ Not tested

### 2. Metadata Marker Without Value

**Issue**: `__EPR_META_TYPE` in A1, but A2 has another `__EPR_META_NAME` instead of value
**Risk**: metadataContext overwritten, TYPE never gets value
**Test Needed**: Two consecutive metadata markers without value between them
**Status**: ✅ Tested
**Fix Applied**: Modified `processCellForMetadata` to flush pending metadata context with null value when encountering a new metadata marker

### 3. Multiple Metadata Markers on Same Row

**Issue**: A1 has `__EPR_META_TYPE`, C1 has `__EPR_META_NAME`
**Risk**: Second marker overwrites metadataContext, first is lost
**Test Needed**: Two metadata markers in same row
**Status**: ❌ Not tested

### 4. Multiple Data Sections with Same Name

**Issue**: Two `__EPR_DATA_UPDATE_WASTE_BALANCE` sections
**Risk**: Second silently overwrites first (line 136)
**Test Needed**: Two data sections with identical names
**Status**: ❌ Not tested

### 5. Data Section Never Ends

**Issue**: No empty row before sheet ends
**Risk**: Line 225 should emit, but not verified
**Test Needed**: Data section that goes to last row without empty terminator
**Status**: ❌ Not tested

### 6. Very Large Column Numbers

**Issue**: Tests go up to AA (27), but not AAA (703) or XFD (16384)
**Risk**: Algorithm untested for large columns
**Test Needed**: columnToLetter/letterToColumnNumber for AAA, XFD
**Status**: ❌ Not tested

### 7. columnToLetter(0) or Negative Numbers

**Issue**: 0 returns empty string, negatives cause infinite loop
**Risk**: Crash or wrong results
**Test Needed**: columnToLetter(0), columnToLetter(-1)
**Status**: ❌ Not tested

### 8. letterToColumnNumber('')

**Issue**: Empty string returns 0
**Risk**: Is this intended behavior?
**Test Needed**: letterToColumnNumber('')
**Status**: ❌ Not tested

### 9. Lowercase Letters in letterToColumnNumber

**Issue**: Assumes uppercase (codePointAt - 64), lowercase gives wrong result
**Risk**: Silent failure, wrong column numbers
**Test Needed**: letterToColumnNumber('a'), letterToColumnNumber('aa')
**Status**: ❌ Not tested

### 10. Markers Not in Column A

**Issue**: No enforcement that markers must be in column A
**Risk**: Metadata uses wrong cell as value, data has wrong startColumn
**Test Needed**: `__EPR_META_TYPE` in C1, `__EPR_DATA_X` in C1
**Status**: ❌ Not tested

## Medium Priority - Edge Cases

### 11. Headers That Are Numbers

**Issue**: Line 81 uses cellValueStr, numbers converted to strings
**Risk**: Is this intentional?
**Test Needed**: Data section with numeric headers
**Status**: ❌ Not tested

### 12. Empty/Null Metadata Value

**Issue**: `__EPR_META_TYPE` followed by empty cell
**Risk**: Stores null or '' as value
**Test Needed**: Metadata marker with empty value cell
**Status**: ❌ Not tested

### 13. Rows with More Cells Than Headers

**Issue**: Line 103 checks columnIndex < headers.length, extra cells ignored
**Risk**: Silent data loss
**Test Needed**: Row with 5 cells but only 3 headers
**Status**: ❌ Not tested

### 14. Completely Empty Worksheet

**Issue**: If eachRow returns nothing
**Risk**: Should return empty result
**Test Needed**: Workbook with empty worksheet
**Status**: ❌ Not tested

### 15. Formula Cells

**Issue**: ExcelJS might return formula or result
**Risk**: Unpredictable behavior
**Test Needed**: Cell with formula in metadata value and data row
**Status**: ❌ Not tested

### 16. Date Cells

**Issue**: Excel dates stored as numbers
**Risk**: Need to verify handling
**Test Needed**: Date in metadata value and data row
**Status**: ❌ Not tested

### 17. Multiple Data Sections on Same Row

**Issue**: `__EPR_DATA_ONE` in A1, `__EPR_DATA_TWO` in E1
**Risk**: Both added to activeCollections - does this work?
**Test Needed**: Two data markers on same row
**Status**: ✅ Already tested (side-by-side)

### 18. Skip Column Marker as First Header

**Issue**: `__EPR_SKIP_COLUMN` immediately after `__EPR_DATA_X`
**Risk**: First header is null
**Test Needed**: Skip marker in first position
**Status**: ❌ Not tested

### 19. All Headers Are Skip Columns

**Issue**: Headers array full of nulls
**Risk**: No actual data columns
**Test Needed**: Data section with only skip columns
**Status**: ❌ Not tested

### 20. Partial Empty Rows

**Issue**: `[null, null, 'X']` - line 119 checks ALL null
**Risk**: Doesn't terminate section, is this correct?
**Test Needed**: Row with some nulls and some values
**Status**: ❌ Not tested

## Testing Strategy

1. Work through high priority first (potential bugs)
2. Use TDD: RED (write failing test) → GREEN (minimal fix) → REFACTOR
3. Track progress in this document
4. Update status as tests are added
5. Document any bugs found and their fixes
