"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { api } from "@/lib/api";

interface ScanResult {
  ok: boolean;
  status: string;
  message: string;
  ticket?: { serial: string; buyer_name: string; category_name?: string };
}

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [key, setKey] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const lastPayload = useRef<string>("");
  const pausedUntil = useRef(0);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get("key");
    if (k) setKey(k);
  }, []);

  async function submitPayload(payload: string) {
    if (Date.now() < pausedUntil.current || payload === lastPayload.current) return;
    lastPayload.current = payload;
    pausedUntil.current = Date.now() + 2500;
    try {
      const res = await api<ScanResult>("/api/public/scan", {
        method: "POST",
        auth: false,
        body: { scanner_key: key, payload },
      });
      setResult(res);
      if (navigator.vibrate) navigator.vibrate(res.ok ? 100 : [80, 60, 80]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    }
    setTimeout(() => {
      lastPayload.current = "";
    }, 3000);
  }

  useEffect(() => {
    if (!running) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        const video = videoRef.current!;
        video.srcObject = stream;
        await video.play();

        const detectorAvailable = "BarcodeDetector" in window;
        const detector = detectorAvailable
          ? new (window as any).BarcodeDetector({ formats: ["qr_code"] })
          : null;

        const tick = async () => {
          if (stopped) return;
          const v = videoRef.current;
          if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
            if (detector) {
              const codes = await detector.detect(v).catch(() => []);
              if (codes.length) await submitPayload(codes[0].rawValue);
            } else {
              const canvas = canvasRef.current!;
              canvas.width = v.videoWidth;
              canvas.height = v.videoHeight;
              const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
              ctx.drawImage(v, 0, 0);
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              const code = jsQR(img.data, img.width, img.height);
              if (code?.data) await submitPayload(code.data);
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Impossible d'accéder à la caméra. Autorisez l'accès ou utilisez la saisie manuelle.");
        setRunning(false);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, key]);

  return (
    <main className="container narrow">
      <h1>Contrôle des billets</h1>

      {!key && (
        <div className="card">
          <label>Clé de scan (fournie par l&apos;organisateur)</label>
          <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="Clé de scan" />
        </div>
      )}

      {result && (
        <div className={`scan-result ${result.ok ? "ok" : "err"}`}>
          <div className="big">{result.ok ? "✓ ENTRÉE AUTORISÉE" : "✗ REFUSÉ"}</div>
          <div>{result.message}</div>
          {result.ticket && (
            <div style={{ marginTop: 8 }}>
              {result.ticket.buyer_name} · {result.ticket.category_name} · {result.ticket.serial}
            </div>
          )}
        </div>
      )}
      {error && <div className="alert err" role="alert">{error}</div>}

      {!running ? (
        <button className="btn-accent" disabled={!key} onClick={() => { setError(null); setRunning(true); }}>
          📷 Démarrer le scan
        </button>
      ) : (
        <button className="btn-ghost" onClick={() => setRunning(false)}>
          Arrêter
        </button>
      )}

      <video ref={videoRef} className="scanner" style={{ display: running ? "block" : "none", marginTop: 12 }} muted playsInline />
      <canvas ref={canvasRef} style={{ display: "none" }} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Saisie manuelle</h3>
        <p className="muted">Si la caméra ne fonctionne pas, collez le contenu du QR code :</p>
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="EG1.…" />
        <button
          className="btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          disabled={!key || !manual}
          onClick={() => {
            lastPayload.current = "";
            pausedUntil.current = 0;
            submitPayload(manual.trim());
          }}
        >
          Vérifier
        </button>
      </div>
    </main>
  );
}
