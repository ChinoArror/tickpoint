// Export and download: write into the app cache, then hand the file to the Android share sheet.
// No storage permission is needed (Directory.Cache is app-private).
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

const DIR = 'exports'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function sanitizeFilename(name: string): string {
  const cleaned = name
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 120)
  return cleaned || 'download'
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      if (comma < 0) reject(new Error('READ_FAILED'))
      else resolve(result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

async function removeStale(): Promise<void> {
  try {
    const { files } = await Filesystem.readdir({ path: DIR, directory: Directory.Cache })
    const cutoff = Date.now() - MAX_AGE_MS
    for (const f of files) {
      const path = `${DIR}/${f.name}`
      const st = await Filesystem.stat({ path, directory: Directory.Cache })
      if (st.mtime < cutoff) await Filesystem.deleteFile({ path, directory: Directory.Cache })
    }
  } catch {
    /* nothing cached yet, or a file vanished: ignore */
  }
}

export async function saveFile(blob: Blob, filename: string): Promise<void> {
  const name = sanitizeFilename(filename)
  const data = await blobToBase64(blob)
  await Filesystem.mkdir({ path: DIR, directory: Directory.Cache, recursive: true }).catch(() => undefined)
  const path = `${DIR}/${Date.now()}-${name}`
  const written = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true })
  try {
    await Share.share({ title: name, dialogTitle: name, files: [written.uri] })
  } finally {
    void removeStale()
  }
}
