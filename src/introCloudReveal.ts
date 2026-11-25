// A small, deterministic noise mask. GSAP animates its threshold; the map stays live below it.
function hash(x: number, y: number) {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263)
  value = Math.imul(value ^ (value >>> 13), 1274126177)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295
}

function noise(x: number, y: number) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const dx = x - x0
  const dy = y - y0
  const sx = dx * dx * (3 - 2 * dx)
  const sy = dy * dy * (3 - 2 * dy)
  const top = hash(x0, y0) * (1 - sx) + hash(x0 + 1, y0) * sx
  const bottom = hash(x0, y0 + 1) * (1 - sx) + hash(x0 + 1, y0 + 1) * sx
  return top * (1 - sy) + bottom * sy
}

function smoothstep(min: number, max: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)))
  return t * t * (3 - 2 * t)
}

export function createIntroCloudReveal(canvas: HTMLCanvasElement) {
  const width = Math.ceil(canvas.clientWidth / 3)
  const height = Math.ceil(canvas.clientHeight / 3)
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { alpha: true })
  if (!context) return () => {}

  const image = context.createImageData(width, height)
  const values = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const cloud =
        noise(nx * 3.4, ny * 3.4) * .58 +
        noise(nx * 8.2 + 14, ny * 8.2 + 7) * .29 +
        noise(nx * 18 + 29, ny * 18 + 11) * .13
      const distance = Math.min(1, Math.hypot((nx - .5) * 1.5, (ny - .5) * 1.25))
      values[y * width + x] = cloud * .78 + distance * .22

      const offset = (y * width + x) * 4
      image.data[offset] = 250
      image.data[offset + 1] = 249
      image.data[offset + 2] = 246
    }
  }

  return (progress: number) => {
    const threshold = -.18 + progress * 1.32
    for (let index = 0; index < values.length; index++) {
      image.data[index * 4 + 3] = Math.round(
        224 * smoothstep(threshold - .11, threshold + .11, values[index]),
      )
    }
    context.putImageData(image, 0, 0)
  }
}
