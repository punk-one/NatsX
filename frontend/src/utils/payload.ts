import { decode as cborDecode, encode as cborEncode } from 'cbor-x'
import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack'

export type PayloadMode = 'text' | 'json' | 'base64' | 'hex' | 'cbor' | 'msgpack'

export interface PreparedPayload {
  payload: string
  payloadBase64?: string
  payloadEncoding: PayloadMode
}

export const payloadModeOptions: Array<{ value: PayloadMode; label: string }> = [
  { value: 'text', label: 'Text' },
  { value: 'json', label: 'JSON' },
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hex' },
  { value: 'cbor', label: 'CBOR' },
  { value: 'msgpack', label: 'MsgPack' },
]

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const strictDecoder = new TextDecoder('utf-8', { fatal: true })

function normalizeBase64(value: string) {
  return value.replace(/\s+/g, '')
}

function normalizeHex(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

export function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

export function base64ToBytes(value: string) {
  const normalized = normalizeBase64(value)
  const binary = atob(normalized)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export function hexToBytes(value: string) {
  const normalized = normalizeHex(value)
  if (normalized.length % 2 !== 0) {
    throw new Error('Invalid hex payload length')
  }

  const result = new Uint8Array(normalized.length / 2)
  for (let index = 0; index < normalized.length; index += 2) {
    const byte = Number.parseInt(normalized.slice(index, index + 2), 16)
    if (Number.isNaN(byte)) {
      throw new Error('Invalid hex payload')
    }
    result[index / 2] = byte
  }
  return result
}

function toUint8Array(value: Uint8Array | ArrayBuffer | ArrayLike<number>) {
  if (value instanceof Uint8Array) {
    return value
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }
  return Uint8Array.from(value)
}

function parseJsonPayload(payload: string) {
  return JSON.parse(payload)
}

function stringifyStructuredPayload(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function decodeUtf8(bytes: Uint8Array, fallback?: string) {
  try {
    return strictDecoder.decode(bytes)
  } catch {
    if (fallback !== undefined) {
      return fallback
    }
    return decoder.decode(bytes)
  }
}

export function formatJsonPayload(payload: string) {
  return stringifyStructuredPayload(parseJsonPayload(payload))
}

export function supportsStructuredFormatting(mode: PayloadMode) {
  return mode === 'json' || mode === 'cbor' || mode === 'msgpack'
}

export function preparePayloadForTransport(payload: string, mode: PayloadMode): PreparedPayload {
  switch (mode) {
    case 'json':
      return {
        payload: formatJsonPayload(payload),
        payloadEncoding: 'json',
      }
    case 'base64': {
      const bytes = base64ToBytes(payload)
      return {
        payload: normalizeBase64(payload),
        payloadBase64: bytesToBase64(bytes),
        payloadEncoding: 'base64',
      }
    }
    case 'hex': {
      const bytes = hexToBytes(payload)
      return {
        payload: normalizeHex(payload),
        payloadBase64: bytesToBase64(bytes),
        payloadEncoding: 'hex',
      }
    }
    case 'cbor': {
      const formattedPayload = formatJsonPayload(payload)
      const bytes = toUint8Array(cborEncode(parseJsonPayload(formattedPayload)))
      return {
        payload: formattedPayload,
        payloadBase64: bytesToBase64(bytes),
        payloadEncoding: 'cbor',
      }
    }
    case 'msgpack': {
      const formattedPayload = formatJsonPayload(payload)
      const bytes = toUint8Array(msgpackEncode(parseJsonPayload(formattedPayload)))
      return {
        payload: formattedPayload,
        payloadBase64: bytesToBase64(bytes),
        payloadEncoding: 'msgpack',
      }
    }
    default:
      return {
        payload,
        payloadEncoding: 'text',
      }
  }
}

export function transformPayloadForDisplay(
  payload: string,
  payloadBase64: string | undefined,
  mode: PayloadMode,
) {
  const bytes = payloadBase64 ? base64ToBytes(payloadBase64) : undefined

  switch (mode) {
    case 'json':
      return formatJsonPayload(bytes ? decodeUtf8(bytes, payload) : payload)
    case 'base64':
      return bytes ? bytesToBase64(bytes) : bytesToBase64(encoder.encode(payload))
    case 'hex':
      return bytes ? bytesToHex(bytes) : bytesToHex(encoder.encode(payload))
    case 'cbor':
      return bytes ? stringifyStructuredPayload(cborDecode(bytes)) : formatJsonPayload(payload)
    case 'msgpack':
      return bytes ? stringifyStructuredPayload(msgpackDecode(bytes)) : formatJsonPayload(payload)
    default:
      return bytes ? decodeUtf8(bytes, payload) : payload
  }
}
