/**
 * MD5 (RFC 1321) — hex de bytes Uint8Array. Compacto, sem dependências.
 * Necessário porque o manifest dos bundles publica MD5 (ADR-01) e o
 * WebCrypto deliberadamente não oferece MD5.
 */

/* eslint-disable no-bitwise */

function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

const S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const K = new Uint32Array(64)
for (let i = 0; i < 64; i++) {
  K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296)
}

export function md5Hex(input: Uint8Array): string {
  const msgLen = input.length
  const totalLen = (((msgLen + 8) >> 6) + 1) << 6
  const buffer = new Uint8Array(totalLen)
  buffer.set(input)
  buffer[msgLen] = 0x80
  const bitLen = msgLen * 8
  // little-endian 64-bit length (JS: safe até 2^53 bits)
  const view = new DataView(buffer.buffer)
  view.setUint32(totalLen - 8, bitLen >>> 0, true)
  view.setUint32(totalLen - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476

  const m = new Uint32Array(16)
  for (let chunk = 0; chunk < totalLen; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      m[i] = view.getUint32(chunk + i * 4, true)
    }
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      } else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      } else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      } else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + K[i] + m[g]) >>> 0
      a = d
      d = c
      c = b
      b = (b + ((f << S[i]) | (f >>> (32 - S[i])))) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const out = new Uint8Array(16)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, a0, true)
  ov.setUint32(4, b0, true)
  ov.setUint32(8, c0, true)
  ov.setUint32(12, d0, true)
  return toHex(out)
}
