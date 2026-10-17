/**
 * Canvas helpers for the profile-photo cropper.
 *
 * The cropper reports the selected square in the coordinates of the image after
 * rotation, so the image is first drawn rotated onto a canvas large enough to
 * hold it, and the square is then copied out and scaled to the output size.
 */

export const AVATAR_OUTPUT_SIZE = 512
const MIN_OUTPUT_SIZE = 128

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', () => reject(new Error('The image could not be read.')))
    image.src = src
  })
}

const toRadians = (degrees) => (degrees * Math.PI) / 180

/** Size of the box that contains a width x height rectangle rotated by `rotation` degrees. */
export function rotatedSize(width, height, rotation) {
  const radians = toRadians(rotation)
  return {
    width: Math.abs(Math.cos(radians) * width) + Math.abs(Math.sin(radians) * height),
    height: Math.abs(Math.sin(radians) * width) + Math.abs(Math.cos(radians) * height),
  }
}

/** Output edge length: never upscale tiny crops past the source, never exceed the target. */
export function outputSize(cropWidth, target = AVATAR_OUTPUT_SIZE) {
  return Math.max(MIN_OUTPUT_SIZE, Math.min(target, Math.round(cropWidth)))
}

/**
 * Crop `imageSrc` to `pixelCrop` (from react-easy-crop's onCropComplete) and
 * return a square JPEG blob. Transparent areas become white, since JPEG has
 * no alpha channel.
 */
export async function cropImageToBlob(imageSrc, pixelCrop, rotation = 0, { quality = 0.9 } = {}) {
  const image = await loadImage(imageSrc)
  const bounds = rotatedSize(image.naturalWidth, image.naturalHeight, rotation)

  const rotatedCanvas = document.createElement('canvas')
  rotatedCanvas.width = Math.round(bounds.width)
  rotatedCanvas.height = Math.round(bounds.height)
  const rotatedContext = rotatedCanvas.getContext('2d')
  if (!rotatedContext) throw new Error('Canvas is not supported in this browser.')
  rotatedContext.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2)
  rotatedContext.rotate(toRadians(rotation))
  rotatedContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2)

  const size = outputSize(pixelCrop.width)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size, size)
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    rotatedCanvas,
    pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height,
    0, 0, size, size,
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The cropped image could not be created.'))),
      'image/jpeg',
      quality,
    )
  })
}
