import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper from 'react-easy-crop'
import { Check, Loader2, RotateCcw, RotateCw, Undo2, ZoomIn, ZoomOut } from 'lucide-react'
import { useLanguage } from '@/contexts/LanguageContext'
import { cropImageToBlob } from '@/lib/crop-image'

const NS = 'profilePage.photoCrop'
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const ZOOM_STEP = 0.2

const iconButton =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'

/**
 * Lets the user position, zoom, and rotate a chosen photo inside a round
 * frame before it is uploaded. `onConfirm` receives a square JPEG blob.
 */
export function AvatarCropDialog({ imageSrc, busy = false, onCancel, onConfirm }) {
  const { t } = useLanguage()
  const titleId = useId()
  const hintId = useId()
  const saveRef = useRef(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [croppedPixels, setCroppedPixels] = useState(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const working = busy || processing

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    saveRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !working) onCancel?.()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [working, onCancel])

  const handleCropComplete = useCallback((_, areaPixels) => setCroppedPixels(areaPixels), [])

  const clampZoom = (value) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(2))))

  const reset = () => {
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setRotation(0)
  }

  const handleSave = async () => {
    if (!croppedPixels) return
    setError('')
    setProcessing(true)
    try {
      const blob = await cropImageToBlob(imageSrc, croppedPixels, rotation)
      await onConfirm?.(blob)
    } catch {
      setError(t(`${NS}.error`, 'This photo could not be processed. Please try another image.'))
    } finally {
      setProcessing(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900"
      >
        <div className="px-5 pb-3 pt-5">
          <h2 id={titleId} className="text-base font-bold text-slate-900 dark:text-slate-50">
            {t(`${NS}.title`, 'Adjust your photo')}
          </h2>
          <p id={hintId} className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {t(`${NS}.hint`, 'Drag to move the photo. Zoom with the slider, mouse wheel, or a pinch.')}
          </p>
        </div>

        <div className="relative mx-5 h-72 overflow-hidden rounded-xl bg-slate-900 sm:h-80" data-testid="avatar-crop-area">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            rotation={rotation}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="contain"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onRotationChange={setRotation}
            onCropComplete={handleCropComplete}
          />
        </div>

        <div className="space-y-3 px-5 pt-4">
          <div className="flex items-center gap-2">
            <button type="button" className={iconButton} onClick={() => setZoom((z) => clampZoom(z - ZOOM_STEP))} disabled={working || zoom <= MIN_ZOOM} aria-label={t(`${NS}.zoomOut`, 'Zoom out')}>
              <ZoomOut className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(clampZoom(Number(event.target.value)))}
              disabled={working}
              aria-label={t(`${NS}.zoom`, 'Zoom')}
              className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary-600"
            />
            <button type="button" className={iconButton} onClick={() => setZoom((z) => clampZoom(z + ZOOM_STEP))} disabled={working || zoom >= MAX_ZOOM} aria-label={t(`${NS}.zoomIn`, 'Zoom in')}>
              <ZoomIn className="h-4 w-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-2">
              <button type="button" className={iconButton} onClick={() => setRotation((r) => (r + 270) % 360)} disabled={working} aria-label={t(`${NS}.rotateLeft`, 'Rotate left')}>
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" className={iconButton} onClick={() => setRotation((r) => (r + 90) % 360)} disabled={working} aria-label={t(`${NS}.rotateRight`, 'Rotate right')}>
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={reset}
              disabled={working}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t(`${NS}.reset`, 'Reset')}
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
              {error}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {t(`${NS}.cancel`, 'Cancel')}
          </button>
          <button
            ref={saveRef}
            type="button"
            onClick={handleSave}
            disabled={working || !croppedPixels}
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-primary-600 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {working ? t(`${NS}.saving`, 'Saving...') : t(`${NS}.save`, 'Save photo')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
