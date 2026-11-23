"use client";

import { useState } from "react";
import { api, uploadFile, useT } from "@/lib/client";
import { ErrorBox } from "./Badges";
import { IconMic } from "./Icons";
import { useRecorder } from "./useRecorder";

export function RescueCapture() {
  const { t } = useT();
  const [mode, setMode] = useState<"text" | "photo" | "voice">("text");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRecorder();

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      let body: Record<string, unknown> = { source: mode, text: text.trim() || undefined };
      if (mode === "photo" && file) body = { ...body, mediaPath: await uploadFile(file, "photo"), mimeType: file.type };
      if (mode === "voice" && audio) body = { ...body, mediaPath: await uploadFile(audio, "audio"), mimeType: audio.type };
      const d = await api<{ id: string }>("/api/surplus", { body });
      window.location.href = `/merchant/rescue/${d.id}`;
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const ready = (mode === "text" && text.trim()) || (mode === "photo" && file) || (mode === "voice" && audio);

  return (
    <div className="stack">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("rescueTitle")}</h1>
      <p className="muted t-mobile-body-lg-regular" style={{ margin: 0 }}>{t("captureHint")}</p>
      <div className="tabs" role="tablist">
        {(["text", "photo", "voice"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className="t-mobile-label-xl-medium" onClick={() => setMode(m)}>{t(m === "text" ? "describe" : m)}</button>
        ))}
      </div>
      <div className="card stack">
        {mode === "photo" && <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="t-mobile-body-lg-regular" />}
        {mode === "voice" && (
          <button type="button" className={`btn ${recorder.recording ? "btn-record" : "btn-secondary"} t-mobile-label-xl-medium`} onClick={async () => {
            if (recorder.recording) setAudio(await recorder.stop());
            else { setAudio(null); try { await recorder.start(); } catch (e) { setError((e as Error).message); } }
          }}>
            <IconMic className="icon" /> {recorder.recording ? t("recording") : audio ? "✓ " + t("voice") : t("voiceUpdate")}
          </button>
        )}
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("typeUpdatePlaceholder")} aria-label={t("describe")} />
        {error && <ErrorBox message={error} />}
        <button type="button" className="btn btn-primary t-mobile-label-xl-medium" disabled={busy || !ready} onClick={submit}>{busy ? t("loading") : t("generateDraft")}</button>
      </div>
    </div>
  );
}
