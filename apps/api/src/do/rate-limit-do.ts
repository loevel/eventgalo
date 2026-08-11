/**
 * Compteur de limitation de débit, une instance de Durable Object par
 * (bucket, clé) — typiquement `checkout:203.0.113.7`.
 *
 * Pourquoi un DO et pas KV : KV n'a pas d'incrément atomique et sert des valeurs
 * mises en cache jusqu'à 60 s en périphérie. Un `get` puis un `put` laissait
 * passer N requêtes lancées en parallèle, qui lisaient toutes le même compteur —
 * exactement le mode opératoire d'un abus, pas un cas limite. Le stockage d'un
 * DO, lui, est transactionnel et sérialisé : la lecture et l'écriture ci-dessous
 * ne peuvent pas s'entrelacer.
 *
 * Fenêtre fixe (pas glissante) : une rafale à cheval sur deux fenêtres peut
 * atteindre 2×limite. Suffisant pour dissuader l'abus, et bien plus strict que
 * ce que permettait l'implémentation KV.
 */

interface Counter {
  count: number;
  resetAt: number;
}

export class RateLimitDO implements DurableObject {
  constructor(
    private state: DurableObjectState,
    private env: unknown,
  ) {}

  async fetch(req: Request): Promise<Response> {
    const { limit, windowSeconds } = (await req.json()) as { limit: number; windowSeconds: number };
    const now = Date.now();
    const current = await this.state.storage.get<Counter>("counter");

    if (!current || now >= current.resetAt) {
      const resetAt = now + windowSeconds * 1000;
      await this.state.storage.put("counter", { count: 1, resetAt });
      // Libère le stockage dès la fenêtre écoulée : sans ça, chaque IP vue une
      // seule fois laisserait un DO qui conserve son état indéfiniment.
      await this.state.storage.setAlarm(resetAt);
      return Response.json({ limited: false, remaining: Math.max(0, limit - 1) });
    }

    if (current.count >= limit) {
      return Response.json({ limited: true, remaining: 0, retry_after: Math.ceil((current.resetAt - now) / 1000) });
    }

    await this.state.storage.put("counter", { count: current.count + 1, resetAt: current.resetAt });
    return Response.json({ limited: false, remaining: Math.max(0, limit - current.count - 1) });
  }

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
