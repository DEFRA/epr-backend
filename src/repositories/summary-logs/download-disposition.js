const ISO_SECONDS_LENGTH = 19

/**
 * Names a download `<name>-<timestamp>.<ext>`, down to the second because a
 * rejected log is often resubmitted the same day. Colons are dropped: they are
 * illegal in Windows filenames.
 *
 * @param {string} name
 * @param {string} timestamp - ISO 8601
 * @param {string} extension
 * @returns {string}
 */
export const buildDownloadDisposition = (name, timestamp, extension) => {
  const stamped = timestamp
    .slice(0, ISO_SECONDS_LENGTH)
    .replace('T', '-')
    .replaceAll(':', '')

  return `attachment; filename="${name}-${stamped}.${extension}"`
}
