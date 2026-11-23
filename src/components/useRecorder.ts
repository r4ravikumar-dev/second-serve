"use client";

import { useRef, useState } from "react";

/** MediaRecorder wrapper: max 60 s, prefers formats Gemini accepts. */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const resolver = useRef<((b: Blob | null) => void) | null>(null);

  const start = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
    const r = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = (r.mimeType || "audio/webm").split(";")[0];
      resolver.current?.(chunks.current.length ? new Blob(chunks.current, { type }) : null);
    };
    rec.current = r;
    r.start();
    setRecording(true);
    setTimeout(() => r.state === "recording" && r.stop(), 60_000);
  };

  const stop = () => new Promise<Blob | null>((resolve) => {
    resolver.current = resolve;
    if (rec.current?.state === "recording") rec.current.stop(); else resolve(null);
    setRecording(false);
  });

  return { recording, start, stop };
}
