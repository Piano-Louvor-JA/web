import { describe, expect, it } from "vitest";

import {
  audioMimeFromBytes,
  audioDataUrlFromBase64,
} from "../services/custom-catalog";

/** SPEC-audio-removal v1.2.0 (RF-05) — paridade app↔web. */
const b64 = (bytes: number[]): string => btoa(String.fromCharCode(...bytes));

describe("audioMimeFromBytes — allowlist 6 formatos (web)", () => {
  it("flac", () => {
    expect(audioMimeFromBytes(new Uint8Array([0x66, 0x4c, 0x61, 0x43]))).toBe(
      "audio/flac",
    );
  });
  it("aac ADTS", () => {
    expect(audioMimeFromBytes(new Uint8Array([0xff, 0xf1]))).toBe("audio/aac");
  });
  it("m4a ftyp", () => {
    expect(
      audioMimeFromBytes(
        new Uint8Array([
          0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x4d, 0x34, 0x41,
        ]),
      ),
    ).toBe("audio/mp4");
  });
  it("wav/ogg", () => {
    expect(audioMimeFromBytes(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(
      "audio/wav",
    );
    expect(audioMimeFromBytes(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toBe(
      "audio/ogg",
    );
  });
  it("desconhecido → mpeg", () => {
    expect(audioMimeFromBytes(new Uint8Array([0x01, 0x02]))).toBe(
      "audio/mpeg",
    );
  });
  it("dataUrl com mime detectado", () => {
    expect(
      audioDataUrlFromBase64(b64([0x66, 0x4c, 0x61, 0x43])).startsWith(
        "data:audio/flac;base64,",
      ),
    ).toBe(true);
  });
});
