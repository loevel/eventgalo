function escapeIcsText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function formatIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

/** Génère un fichier .ics (RFC 5545) à un seul événement. */
export function buildIcsEvent(opts: {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt?: string | null;
  url?: string;
}): string {
  const start = formatIcsDate(opts.startsAt);
  const end = formatIcsDate(opts.endsAt ?? new Date(new Date(opts.startsAt).getTime() + 2 * 3600_000).toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EventGalo//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@eventgalo.com`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${escapeIcsText(opts.description)}`] : []),
    ...(opts.location ? [`LOCATION:${escapeIcsText(opts.location)}`] : []),
    ...(opts.url ? [`URL:${opts.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

export function icsResponse(ics: string, filename: string): Response {
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}.ics"`,
    },
  });
}
