import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'
import coreURL from '@ffmpeg/core?url'
import wasmURL from '@ffmpeg/core/wasm?url'

export const MAX_UPLOAD_BYTES = 45 * 1024 * 1024 // margen bajo el límite de 50 MB del plan gratis de Supabase

const MAX_WIDTH = 1920 // no reescalar salvo que venga en una resolución mayor a Full HD
const AUDIO_BITRATE_KBPS = 128
const MIN_VIDEO_BITRATE_KBPS = 250 // piso para que un video muy largo no quede ilegible
const SIZE_SAFETY_FACTOR = 0.92 // margen para overhead del contenedor + variación real del encoder

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

/** Duración del video en segundos, leída desde sus metadatos (sin decodificar frames). */
function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.src = url
    const cleanup = () => URL.revokeObjectURL(url)
    video.onloadedmetadata = () => {
      const duration = video.duration
      cleanup()
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0)
    }
    video.onerror = () => {
      cleanup()
      resolve(0)
    }
  })
}

/**
 * Si el video ya pesa menos que `maxBytes`, lo devuelve tal cual. Si no, lo comprime en el
 * navegador con ffmpeg.wasm apuntando al bitrate justo para caber en `maxBytes`, en vez de
 * aplicar una compresión fija: así se conserva la mayor calidad posible para ese límite de peso,
 * y solo se reduce la resolución si el original supera Full HD.
 */
export async function compressVideoIfNeeded(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
  onProgress?: (ratio: number) => void,
): Promise<File> {
  if (file.size <= maxBytes) return file

  const durationSeconds = await getVideoDurationSeconds(file)

  const ffmpeg = await getFFmpeg()
  const ext = file.name.match(/\.\w+$/)?.[0] ?? '.mp4'
  const inputName = `input${ext}`
  const outputName = 'output.mp4'

  const onFFmpegProgress = ({ progress }: { progress: number }) => onProgress?.(Math.min(1, Math.max(0, progress)))
  if (onProgress) ffmpeg.on('progress', onFFmpegProgress)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    const args = ['-i', inputName, '-vf', `scale='min(${MAX_WIDTH},iw)':-2`, '-c:v', 'libx264']

    if (durationSeconds > 0) {
      const targetTotalKbps = (maxBytes * 8 * SIZE_SAFETY_FACTOR) / durationSeconds / 1000
      const videoBitrateKbps = Math.max(MIN_VIDEO_BITRATE_KBPS, Math.round(targetTotalKbps - AUDIO_BITRATE_KBPS))
      args.push(
        '-b:v',
        `${videoBitrateKbps}k`,
        '-maxrate',
        `${Math.round(videoBitrateKbps * 1.45)}k`,
        '-bufsize',
        `${videoBitrateKbps * 2}k`,
      )
    } else {
      // No se pudo leer la duración: se recurre a un factor de calidad fijo como red de seguridad.
      args.push('-crf', '28')
    }

    args.push('-preset', 'veryfast', '-c:a', 'aac', '-b:a', `${AUDIO_BITRATE_KBPS}k`, outputName)

    await ffmpeg.exec(args)
    const data = await ffmpeg.readFile(outputName)
    const blob = new Blob([data as Uint8Array], { type: 'video/mp4' })
    return new File([blob], file.name.replace(/\.\w+$/, '.mp4'), { type: 'video/mp4' })
  } finally {
    if (onProgress) ffmpeg.off('progress', onFFmpegProgress)
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputName).catch(() => {})
  }
}
