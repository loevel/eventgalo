import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index";
import { seedCategory, seedEvent, seedGuest, seedMedia, seedTicket, seedUser } from "./helpers";

/** Le cron horaire porte les rappels, le récapitulatif et le balayage. */
async function runHourlyCron() {
  const ctx = createExecutionContext();
  await worker.scheduled!(
    { cron: "0 * * * *", scheduledTime: Date.now(), noRetry() {} } as ScheduledController,
    env,
    ctx,
  );
  await waitOnExecutionContext(ctx);
}

/**
 * `sendEmail` passe par le binding `env.EMAIL` et se tait quand `EMAIL_FROM` est
 * absent, comme en test : on ne peut donc pas observer le transport. Les
 * marqueurs `recap_sent_at` sont de toute façon la meilleure preuve — c'est eux
 * qui décident qui est servi et qui ne le sera plus.
 */
async function recapSentToTicket(email: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT recap_sent_at FROM tickets WHERE buyer_email = ?")
    .bind(email)
    .first<{ recap_sent_at: string | null }>();
  return Boolean(row?.recap_sent_at);
}

async function recapSentToGuest(email: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT recap_sent_at FROM guests WHERE email = ?")
    .bind(email)
    .first<{ recap_sent_at: string | null }>();
  return Boolean(row?.recap_sent_at);
}

async function eventClosed(eventId: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT recap_sent_at FROM events WHERE id = ?")
    .bind(eventId)
    .first<{ recap_sent_at: string | null }>();
  return Boolean(row?.recap_sent_at);
}

/** Place l'événement dans la fenêtre d'envoi : terminé il y a deux jours. */
async function endEventAgo(eventId: string, msAgo: number) {
  const start = new Date(Date.now() - msAgo).toISOString();
  const end = new Date(Date.now() - msAgo + 4 * 3600 * 1000).toISOString();
  await env.DB.prepare("UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?").bind(start, end, eventId).run();
}

async function publishPhoto(eventId: string) {
  const { id } = await seedMedia(eventId);
  await env.DB.prepare("UPDATE media SET featured = 1 WHERE id = ?").bind(id).run();
}

/** Événement terminé il y a deux jours, avec photos publiées : éligible. */
async function seedFinishedEventWithPhotos(organizerId: string, title = "Gala terminé") {
  const { id, slug } = await seedEvent(organizerId, { title, type: "ticketed" });
  await endEventAgo(id, 2 * 24 * 3600 * 1000);
  await publishPhoto(id);
  return { id, slug };
}

describe("récapitulatif d'après-événement", () => {
  it("clôt l'événement et n'écrit qu'aux billets scannés", async () => {
    const organizer = await seedUser();
    const { id } = await seedFinishedEventWithPhotos(organizer.id);
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "presente@example.com", status: "used" });
    await seedTicket(id, categoryId, { buyerEmail: "absente@example.com", status: "valid" });

    await runHourlyCron();

    expect(await recapSentToTicket("presente@example.com")).toBe(true);
    expect(await recapSentToTicket("absente@example.com")).toBe(false);
    expect(await eventClosed(id)).toBe(true);
  });

  it("écrit aux invités ayant répondu oui, pas aux autres", async () => {
    const organizer = await seedUser();
    const { id } = await seedFinishedEventWithPhotos(organizer.id, "Gala invités");
    const yes = await seedGuest(id, { email: "oui@example.com" });
    const no = await seedGuest(id, { email: "non@example.com" });
    await env.DB.prepare("UPDATE guests SET rsvp_status = 'yes' WHERE id = ?").bind(yes.id).run();
    await env.DB.prepare("UPDATE guests SET rsvp_status = 'no' WHERE id = ?").bind(no.id).run();
    await seedGuest(id, { email: "sansreponse@example.com" }); // rsvp_status = 'pending'

    await runHourlyCron();

    expect(await recapSentToGuest("oui@example.com")).toBe(true);
    expect(await recapSentToGuest("non@example.com")).toBe(false);
    expect(await recapSentToGuest("sansreponse@example.com")).toBe(false);
  });

  it("n'envoie rien tant qu'aucune photo n'est publiée", async () => {
    const organizer = await seedUser();
    const { id } = await seedEvent(organizer.id, { title: "Sans photos", type: "ticketed" });
    await endEventAgo(id, 2 * 24 * 3600 * 1000);
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "sansphotos@example.com", status: "used" });

    await runHourlyCron();

    expect(await recapSentToTicket("sansphotos@example.com")).toBe(false);
    expect(await eventClosed(id)).toBe(false);
  });

  it("part dès que les photos arrivent, même plusieurs jours après", async () => {
    const organizer = await seedUser();
    const { id } = await seedEvent(organizer.id, { title: "Photos tardives", type: "ticketed" });
    await endEventAgo(id, 4 * 24 * 3600 * 1000);
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "tardive@example.com", status: "used" });

    await runHourlyCron();
    expect(await recapSentToTicket("tardive@example.com")).toBe(false);

    await publishPhoto(id); // l'organisateur trie enfin sa soirée
    await runHourlyCron();
    expect(await recapSentToTicket("tardive@example.com")).toBe(true);
  });

  it("n'envoie jamais deux fois, même si le cron repasse", async () => {
    const organizer = await seedUser();
    const { id } = await seedFinishedEventWithPhotos(organizer.id, "Gala repassage");
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "unefois@example.com", status: "used" });

    await runHourlyCron();
    const firstMark = await env.DB.prepare("SELECT recap_sent_at FROM tickets WHERE buyer_email = ?")
      .bind("unefois@example.com")
      .first<{ recap_sent_at: string }>();
    expect(firstMark?.recap_sent_at).toBeTruthy();

    await runHourlyCron();
    const secondMark = await env.DB.prepare("SELECT recap_sent_at FROM tickets WHERE buyer_email = ?")
      .bind("unefois@example.com")
      .first<{ recap_sent_at: string }>();
    // Un marqueur inchangé prouve que la seconde tournée n'a pas retouché la ligne.
    expect(secondMark?.recap_sent_at).toBe(firstMark?.recap_sent_at);
  });

  it("ignore un événement terminé depuis plus de sept jours", async () => {
    const organizer = await seedUser();
    const { id } = await seedEvent(organizer.id, { title: "Trop vieux", type: "ticketed" });
    await endEventAgo(id, 30 * 24 * 3600 * 1000);
    await publishPhoto(id);
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "tropvieux@example.com", status: "used" });

    await runHourlyCron();

    expect(await recapSentToTicket("tropvieux@example.com")).toBe(false);
  });

  it("ignore un événement qui vient tout juste de se terminer", async () => {
    const organizer = await seedUser();
    const { id } = await seedEvent(organizer.id, { title: "Tout juste fini", type: "ticketed" });
    await endEventAgo(id, 3 * 3600 * 1000);
    await publishPhoto(id);
    const { id: categoryId } = await seedCategory(id);
    await seedTicket(id, categoryId, { buyerEmail: "troptot@example.com", status: "used" });

    await runHourlyCron();

    expect(await recapSentToTicket("troptot@example.com")).toBe(false);
  });
});
