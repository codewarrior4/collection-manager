/**
 * Triggers a browser file download by creating a temporary anchor element,
 * setting a blob URL, programmatically clicking it, then cleaning up.
 *
 * @param content  - The string content to write into the downloaded file
 * @param filename - The suggested filename for the download
 * @param mimeType - The MIME type of the file (defaults to application/json)
 */
export function downloadFile(
  content: string,
  filename: string,
  mimeType: string = 'application/json',
): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)

  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'

  document.body.appendChild(anchor)
  anchor.click()

  // Clean up: remove the element and revoke the object URL
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}
