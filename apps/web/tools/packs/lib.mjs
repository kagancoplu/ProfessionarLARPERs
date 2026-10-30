/** Shared helpers for the pack pipeline (sharp-based, raw RGBA buffers). */
import sharp from 'sharp'
import { resolve } from 'node:path'

export const PACKS = resolve(process.cwd(), 'assets/packs')
export const KENMI = resolve(PACKS, 'Cute_Fantasy')

/** Load a PNG as raw RGBA. */
export async function loadRaw (file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data, w: info.width, h: info.height }
}

export function blank (w, h) { return { data: Buffer.alloc(w * h * 4, 0), w, h } }

/** Alpha-over blit of a region of src onto dst at (dx, dy). */
export function blit (dst, src, sx, sy, w, h, dx, dy) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((sy + y) * src.w + (sx + x)) * 4
      const a = src.data[si + 3]
      if (a === 0) continue
      const di = ((dy + y) * dst.w + (dx + x)) * 4
      if (a === 255) { dst.data[di] = src.data[si]; dst.data[di + 1] = src.data[si + 1]; dst.data[di + 2] = src.data[si + 2]; dst.data[di + 3] = 255; continue }
      const da = dst.data[di + 3] / 255; const sa = a / 255; const oa = sa + da * (1 - sa)
      for (let c = 0; c < 3; c++) dst.data[di + c] = Math.round((src.data[si + c] * sa + dst.data[di + c] * da * (1 - sa)) / (oa || 1))
      dst.data[di + 3] = Math.round(oa * 255)
    }
  }
}

export function crop (src, sx, sy, w, h) { const out = blank(w, h); blit(out, src, sx, sy, w, h, 0, 0); return out }

export async function toPng (img) { return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer() }

export async function savePng (img, file) { await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file) }

/** Is the region fully transparent? */
export function isEmpty (src, sx, sy, w, h) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (src.data[((sy + y) * src.w + sx + x) * 4 + 3] !== 0) return false
  return true
}
