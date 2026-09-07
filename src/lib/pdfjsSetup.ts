import { GlobalWorkerOptions } from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url'

GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl
