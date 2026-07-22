"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Sparkles } from "lucide-react";
import { api } from "@/lib/api";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string): string {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `il y a ${diffD} j`;
}

/** Cloche de notifications in-app — visible uniquement pour un compte connecté. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const [digest, setDigest] = useState<string | null>(null);
  const [digestBusy, setDigestBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function generateDigest() {
    setDigestBusy(true);
    try {
      const res = await api<{ text: string | null }>("/api/notifications/digest", { method: "POST" });
      setDigest(res.text);
    } catch {
      // Silencieux : le résumé est un bonus, la liste brute reste disponible.
    } finally {
      setDigestBusy(false);
    }
  }

  async function load() {
    try {
      const res = await api<{ notifications: Notification[]; unread: number }>("/api/notifications");
      setItems(res.notifications);
      setUnread(res.unread);
    } catch {
      // Silencieux : la cloche reste simplement à son dernier état connu.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEscape(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  async function select(n: Notification) {
    if (!n.read_at) {
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)));
      setUnread((u) => Math.max(0, u - 1));
      api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => {});
    }
    setOpen(false);
    if (n.link) router.push(n.link);
  }

  async function markAllRead() {
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? new Date().toISOString() })));
    setUnread(0);
    setDigest(null);
    api("/api/notifications/read-all", { method: "POST" }).catch(() => {});
  }

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button
        type="button"
        className="notif-bell-btn"
        aria-label="Notifications"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
      >
        <Bell size={19} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          {items.length > 0 && (
            <button type="button" className="notif-markall" onClick={markAllRead}>
              Tout marquer comme lu
            </button>
          )}
          {unread >= 3 && (
            digest ? (
              <p className="notif-digest">
                <Sparkles size={13} style={{ flexShrink: 0, marginTop: 1, color: "var(--accent)" }} />
                <span>{digest}</span>
              </p>
            ) : (
              <button type="button" className="notif-digest-btn" disabled={digestBusy} onClick={generateDigest}>
                <Sparkles size={13} /> {digestBusy ? "Résumé en cours…" : "Résumer avec l'IA"}
              </button>
            )
          )}
          {items.length === 0 ? (
            <p className="notif-empty">Rien de nouveau.</p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                type="button"
                className={`notif-item${n.read_at ? "" : " unread"}`}
                onClick={() => select(n)}
              >
                <div className="notif-item-title">{n.title}</div>
                {n.body && <div className="notif-item-body">{n.body}</div>}
                <div className="notif-item-time">{timeAgo(n.created_at)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
