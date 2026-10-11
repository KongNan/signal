// MIDI meta-event text (lyrics, text, ...) has no standardized encoding.
// midifile-ts reads it as one byte per char, so the raw bytes survive in the
// string and can be re-interpreted: UTF-8 first (strict), then GBK, which is
// common in Chinese MIDI files. Export mirrors this by writing UTF-8 bytes.

let gbkDecoder: TextDecoder | null | undefined

const getGbkDecoder = () => {
  if (gbkDecoder === undefined) {
    try {
      gbkDecoder = new TextDecoder("gbk")
    } catch {
      // Environment without GBK support: fall back to the raw text.
      gbkDecoder = null
    }
  }
  return gbkDecoder
}

const countCJKChars = (s: string) =>
  (s.match(/[\u3400-\u9fff\uf900-\ufaff]/g) ?? []).length

// Some GBK sequences are also valid UTF-8 (e.g. 一 encodes to D2 BB, a valid
// 2-byte UTF-8 pair that reads as U+04BB). Such mis-reads produce non-CJK
// characters in U+0100-U+07FF (above Latin-1) while a genuine UTF-8 reading
// of Chinese contains CJK — use that signature to pick the GBK reading only
// when it makes sense (Latin-1 text like "café" stays UTF-8).
export const decodeMidiText = (text: string): string => {
  if (!/[^\x00-\x7F]/.test(text)) {
    return text
  }
  const bytes = Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff)
  let utf8Text: string | null = null
  try {
    utf8Text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    // not valid UTF-8
  }
  if (utf8Text === null) {
    const decoder = getGbkDecoder()
    return decoder ? decoder.decode(bytes) : text
  }
  const decoder = getGbkDecoder()
  const gbkText = decoder ? decoder.decode(bytes) : text
  const looksLikeGbkMojibake =
    countCJKChars(utf8Text) === 0 && /[\u0100-\u07FF]/.test(utf8Text)
  if (looksLikeGbkMojibake && countCJKChars(gbkText) > 0) {
    return gbkText
  }
  return utf8Text
}

export const encodeMidiText = (text: string): string => {
  if (!/[^\x00-\x7F]/.test(text)) {
    return text
  }
  const bytes = new TextEncoder().encode(text)
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("")
}
