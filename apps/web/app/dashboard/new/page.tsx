"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { EventForm, type EventFormPayload } from "@/components/event-form";

export default function NewEvent() {
  const router = useRouter();

  async function create(payload: EventFormPayload) {
    const res = await api<{ event: { id: string } }>("/api/events", { method: "POST", body: payload });
    router.replace(`/dashboard/e/${res.event.id}`);
  }

  return (
    <main className="container narrow">
      <h1>Créer un événement</h1>
      <EventForm submitLabel="Créer l'événement" onSubmit={create} />
    </main>
  );
}
