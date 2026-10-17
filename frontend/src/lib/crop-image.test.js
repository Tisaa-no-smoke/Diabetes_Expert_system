import { describe, expect, it } from 'vitest'
import { AVATAR_OUTPUT_SIZE, outputSize, rotatedSize } from './crop-image'

describe('rotatedSize', () => {
  it('keeps dimensions at 0 and 180 degrees', () => {
    expect(rotatedSize(400, 300, 0)).toEqual({ width: 400, height: 300 })
    const half = rotatedSize(400, 300, 180)
    expect(half.width).toBeCloseTo(400)
    expect(half.height).toBeCloseTo(300)
  })

  it('swaps dimensions at 90 and 270 degrees', () => {
    for (const rotation of [90, 270]) {
      const size = rotatedSize(400, 300, rotation)
      expect(size.width).toBeCloseTo(300)
      expect(size.height).toBeCloseTo(400)
    }
  })
})

describe('outputSize', () => {
  it('caps large crops at the avatar size', () => {
    expect(outputSize(3000)).toBe(AVATAR_OUTPUT_SIZE)
  })

  it('does not upscale a crop smaller than the avatar size', () => {
    expect(outputSize(300.4)).toBe(300)
  })

  it('keeps a usable minimum for tiny crops', () => {
    expect(outputSize(20)).toBe(128)
  })
})
