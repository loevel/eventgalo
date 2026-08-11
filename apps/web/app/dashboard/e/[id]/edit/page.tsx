"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { EventForm, type EventFormPayload } from "@/components/event-form";

export default function EditEvent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/");
      return;
    }
    api<{ event: Record<string, any> }>(`/api/events/${id}`)
      .then((r) => setEvent(r.event))
      .catch((e) => {
        if (e.status === 401) router.replace("/");
        else setError(e.message);
      });
  }, [id, router]);

  async function save(payload: EventFormPayload) {
    await api(`/api/events/${id}`, { method: "PATCH", body: payload });
    router.replace(`/dashboard/e/${id}`);
  }

  if (!event) {
    return (
      <main className="container narrow">
        {error ? <div className="alert err" role="alert">{error}</div> : <p className="muted">Chargement…</p>}
      </main>
    );
  }

  return (
    <main className="container narrow">
      <h1>Modifier l&apos;événement</h1>
      <EventForm initial={event} submitLabel="Enregistrer les modifications" onSubmit={save} />
    </main>
  );
}
