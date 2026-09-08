const MAX_FILENAME_LENGTH = 100
const FALLBACK_EXTENSION = '.xlsx'

// Control characters would let a stored name inject a second header; quotes and
// backslashes would break out of the quoted-string the name sits in. Matching
// them is the point, hence the disable.
// eslint-disable-next-line no-control-regex
const UNSAFE = /[\u0000-\u001f\u007f-\u009f"\\]/g
const NON_ASCII = /[^\u0020-\u007e]/g

/**
 * The last segment of a name, without any leading dots.
 * @param {string} name
 * @returns {string}
 */
const baseName = (name) =>
  name
    .replace(/^.*[/\\]/, '')
    .replace(/^\.+/, '')
    .trim()

/**
 * Shortens a name from the front of its stem, so the extension survives.
 * @param {string} name
 * @returns {string}
 */
const capped = (name) => {
  if (name.length <= MAX_FILENAME_LENGTH) {
    return name
  }

  const dot = name.lastIndexOf('.')
  const extension = dot === -1 ? '' : name.slice(dot)

  return name.slice(0, MAX_FILENAME_LENGTH - extension.length) + extension
}

/**
 * A `Content-Disposition` naming a summary log by the file the operator
 * uploaded.
 *
 * S3 returns the value verbatim and it reaches a browser's Save As, so the
 * stored name is stripped of anything that would break the header or carry a
 * path. A name left with no usable ASCII falls back to the summary log id.
 *
 * A non-ASCII name is stated twice, per RFC 8187: an ASCII `filename` for
 * clients that read only that, and an encoded `filename*` carrying the original.
 * @param {string} name
 * @param {string} summaryLogId
 * @returns {string}
 */
export const summaryLogContentDisposition = (name, summaryLogId) => {
  const safe = baseName(name.replace(UNSAFE, ''))
  const ascii = capped(safe.replace(NON_ASCII, '').trim())

  // A residue starting with a dot is a bare extension: the leading dots were
  // already stripped, so these came from removing the non-ASCII stem.
  const usable = ascii !== '' && !ascii.startsWith('.')
  const filename = usable ? ascii : `${summaryLogId}${FALLBACK_EXTENSION}`
  const disposition = `attachment; filename="${filename}"`

  return safe === ascii
    ? disposition
    : `${disposition}; filename*=UTF-8''${encodeURIComponent(safe)}`
}
