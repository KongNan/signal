import { describe, expect, it } from "vitest"
import { decodeMidiText, encodeMidiText } from "./textEncoding"

// midifile-ts reads meta-event text as one byte per char, so test inputs are
// strings whose char codes are the raw file bytes.
const bytes = (codes: readonly number[]) => String.fromCodePoint(...codes)

describe("decodeMidiText", () => {
  it("keeps ASCII text as is", () => {
    expect(decodeMidiText("la")).toBe("la")
  })

  it("decodes UTF-8 encoded lyrics", () => {
    // "你好" as UTF-8 bytes
    expect(decodeMidiText(bytes([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]))).toBe(
      "你好",
    )
  })

  it("decodes GBK encoded lyrics", () => {
    // "你好" as GBK bytes (invalid UTF-8)
    expect(decodeMidiText(bytes([0xc4, 0xe3, 0xba, 0xc3]))).toBe("你好")
  })

  it("prefers GBK when the GBK bytes also form valid UTF-8", () => {
    // "一" is D2 BB in GBK, which is a valid 2-byte UTF-8 pair (һ);
    // the Latin Extended mojibake signature must pick the GBK reading.
    expect(decodeMidiText(bytes([0xd2, 0xbb]))).toBe("一")
  })

  it("keeps UTF-8 Latin-1 text (é reads as a valid GBK pair)", () => {
    // "café" as UTF-8 bytes: C3 A9 is a valid GBK pair, but the UTF-8
    // reading has accents below U+0100, so it must not be treated as GBK.
    expect(decodeMidiText(bytes([0x63, 0x61, 0x66, 0xc3, 0xa9]))).toBe("café")
  })
})

describe("encodeMidiText", () => {
  it("keeps ASCII text as is", () => {
    expect(encodeMidiText("la")).toBe("la")
  })

  it("encodes non-ASCII text as UTF-8 bytes in a latin1 string", () => {
    expect(encodeMidiText("你好")).toBe(
      bytes([0xe4, 0xbd, 0xa0, 0xe5, 0xa5, 0xbd]),
    )
  })

  it("round-trips through decode", () => {
    const text = "中文歌词 Chinese 一二三"
    expect(decodeMidiText(encodeMidiText(text))).toBe(text)
  })
})
