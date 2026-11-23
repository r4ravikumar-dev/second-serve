"use client";

import { useEffect, useState } from "react";
import { api, useT } from "@/lib/client";
import { firebaseApp } from "@/lib/firebaseClient";
import { ErrorBox, Loading } from "./Badges";

type DemoUser = { id: string; displayName: string; role: string };

export function LoginPanel({ mode }: { mode: "dev" | "firebase" }) {
  const { t } = useT();
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (mode === "dev") api<DemoUser[]>("/api/dev/users").then(setUsers).catch((e) => setError(e.message));
  }, [mode]);

  const finish = async (body: object) => {
    setBusy(true); setError(null);
    try { await api("/api/session", { body }); window.location.href = "/"; }
    catch (e) { setError((e as Error).message); setBusy(false); }
  };

  const firebaseSignIn = async (kind: "google" | "email" | "create") => {
    setBusy(true); setError(null);
    try {
      const a = await import("firebase/auth");
      const auth = a.getAuth(firebaseApp());
      const cred = kind === "google"
        ? await a.signInWithPopup(auth, new a.GoogleAuthProvider())
        : kind === "create"
          ? await a.createUserWithEmailAndPassword(auth, email, password)
          : await a.signInWithEmailAndPassword(auth, email, password);
      await finish({ idToken: await cred.user.getIdToken() });
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  return (
    <div className="stack-lg">
      <h1 className="t-mobile-heading-xl" style={{ margin: 0 }}>{t("signIn")}</h1>
      {error && <ErrorBox message={error} />}
      {mode === "dev" ? (
        <div className="stack">
          <div className="alert alert-info t-mobile-body-sm-regular">{t("devSignInNote")}</div>
          {!users ? <Loading /> : users.map((u) => (
            <button key={u.id} type="button" disabled={busy} className="card card-tight interactive row-between" style={{ border: 0, textAlign: "left" }} onClick={() => finish({ devUserId: u.id })}>
              <span className="t-mobile-heading-sm">{u.displayName}</span>
              <span className="badge badge-neutral t-mobile-label-md-medium">{u.role.replace("_", " ")}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="card stack">
          <button type="button" className="btn btn-primary btn-block t-mobile-label-xl-medium" disabled={busy} onClick={() => firebaseSignIn("google")}>{t("signInGoogle")}</button>
          <div className="divider" />
          <label className="field t-mobile-label-lg-medium"><span>{t("email")}</span><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label className="field t-mobile-label-lg-medium"><span>{t("password")}</span><input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <div className="row">
            <button type="button" className="btn btn-secondary t-mobile-label-xl-medium" disabled={busy || !email || password.length < 6} onClick={() => firebaseSignIn("email")}>{t("signInEmail")}</button>
            <button type="button" className="btn btn-ghost t-mobile-label-xl-medium" disabled={busy || !email || password.length < 6} onClick={() => firebaseSignIn("create")}>{t("createAccount")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
