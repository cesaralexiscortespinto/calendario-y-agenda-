import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024 // margen bajo el límite de 50 MB del plan gratis de Supabase

let ffmpegPromise: Promise<FFmpeg> | null = null

function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      await ffmpeg.load({ coreURL, wasmURL })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

/** Si el video ya pesa menos que `maxBytes`, lo devuelve tal cual. Si no, lo comprime en el navegador con ffmpeg.wasm. */
export async function compressVideoIfNeeded(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  if (file.size <= maxBytes) return file

  const ffmpeg = await getFFmpeg()
  const ext = file.name.match(/\.\w+$/)?.[0] ?? '.mp4'
  const inputName = `input${ext}`
  const outputName = 'output.mp4'

  const onFFmpegProgress = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)))
  if (onProgress) ffmpeg.on('progress', onFFmpegProgress)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))
    await ffmpeg.exec([
      '-i',
      inputName,
      '-vf',
      "scale='min(854,iw)':-2",
      '-c:v',
      'libx264',
      '-crf',
      '32',
      '-preset',
      'veryfast',
      '-c:a',
      'aac',
      '-b:a',
      '96k',
      outputName,
    ])
    const data = await ffmpeg.readFile(outputName)
    const blob = new Blob([data as Uint8Array], { type: 'video/mp4' })
    return new File([blob], file.name.replace(/\.\w+$/, '.mp4'), { type: 'video/mp4' })
  } finally {
    if (onProgress) ffmpeg.off('progress', onFFmpegProgress)
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}
