import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CheckoutForm } from "@/components/checkout-form";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, api: vi.fn() };
});

const mockedApi = vi.mocked(api);

const CATEGORIES = [
  { id: "std", name: "Standard", price_cents: 2000, currency: "CAD", quantity: 100, sold: 10 },
  { id: "vip", name: "VIP", price_cents: 5000, currency: "CAD", quantity: 10, sold: 8 },
  { id: "vip-plus", name: "VIP+", price_cents: 10000, currency: "CAD", quantity: 5, sold: 5 },
];

/**
 * Le formulaire rafraîchit les compteurs de stock au montage (la page événement
 * est mise en cache 60 s côté serveur). Ce premier appel ne doit pas consommer
 * la réponse préparée pour la soumission : on route donc les réponses par chemin
 * d'API plutôt que par ordre d'appel.
 */
function stubApi(routes: Record<string, unknown> = {}) {
  mockedApi.mockImplementation(async (path: string) => {
    if (path in routes) {
      const value = routes[path];
      if (value instanceof Error) throw value;
      return value as never;
    }
    // Rafraîchissement du stock : on renvoie les compteurs inchangés.
    if (path.startsWith("/api/public/events/")) return { categories: CATEGORIES } as never;
    return {} as never;
  });
}

beforeEach(() => {
  mockedApi.mockReset();
  stubApi();
});

describe("CheckoutForm", () => {
  it("affiche un message quand la billetterie n'est pas encore ouverte", () => {
    render(<CheckoutForm slug="mon-gala" categories={[]} />);
    expect(screen.getByText(/n&apos;est pas encore ouverte|n'est pas encore ouverte/)).toBeTruthy();
  });

  it("sélectionne la première catégorie par défaut et affiche son prix", () => {
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    const std = screen.getByRole("radio", { name: /Standard/ });
    expect(std).toHaveAttribute("aria-checked", "true");
    expect(std.textContent).toMatch(/20,00/);
  });

  it("change la sélection au clic sur une autre catégorie", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    await user.click(screen.getByRole("radio", { name: /VIP(?!\+)/ }));
    expect(screen.getByRole("radio", { name: /VIP(?!\+)/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /Standard/ })).toHaveAttribute("aria-checked", "false");
  });

  it("signale un stock faible sans marquer la catégorie comme épuisée", () => {
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    const vip = screen.getByRole("radio", { name: /VIP(?!\+)/ });
    expect(vip).not.toHaveClass("disabled");
    expect(vip.textContent).toMatch(/Plus que 2 places/);
  });

  it("bascule en liste d'attente pour une catégorie épuisée", async () => {
    const user = userEvent.setup();
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    await user.click(screen.getByRole("radio", { name: /VIP\+/ }));
    expect(screen.getByText("Épuisé")).toBeTruthy();
    expect(screen.getByRole("button", { name: /liste d&apos;attente|liste d'attente/ })).toBeTruthy();
  });

  it("soumet la liste d'attente avec la bonne charge utile et affiche le rang", async () => {
    stubApi({ "/api/public/waitlist": { ok: true, kind: "waitlist", rank: 3, sold_out: true } });
    const user = userEvent.setup();
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    await user.click(screen.getByRole("radio", { name: /VIP\+/ }));
    await user.type(screen.getByLabelText("Nom complet"), "Ada Lovelace");
    await user.type(screen.getByLabelText(/Email/), "ada@example.com");
    await user.click(screen.getByRole("button", { name: /liste d&apos;attente|liste d'attente/ }));

    await waitFor(() => expect(screen.getByText(/sur la liste d&apos;attente|sur la liste d'attente/)).toBeTruthy());
    // Le rang est ce qui rend l'attente supportable : il doit être affiché.
    expect(screen.getByText("3e")).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledWith(
      "/api/public/waitlist",
      expect.objectContaining({
        method: "POST",
        body: { category_id: "vip-plus", name: "Ada Lovelace", email: "ada@example.com" },
      }),
    );
  });

  it("émet les billets directement quand le mode n'est pas stripe", async () => {
    stubApi({
      "/api/public/checkout": { mode: "free", tickets: [{ serial: "ABC123", url: "/t/ABC123" }] },
    });
    const user = userEvent.setup();
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    await user.type(screen.getByLabelText("Nom complet (billet nominatif)"), "Grace Hopper");
    await user.type(screen.getByLabelText(/Email/), "grace@example.com");
    await user.click(screen.getByLabelText(/coordonnées soient utilisées/));
    await user.click(screen.getByRole("button", { name: /Payer/ }));

    await waitFor(() => expect(screen.getByText("Billets émis !")).toBeTruthy());
    expect(screen.getByText(/ABC123/)).toBeTruthy();
    expect(mockedApi).toHaveBeenCalledWith(
      "/api/public/checkout",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ slug: "mon-gala", category_id: "std", quantity: 1 }),
      }),
    );
  });

  it("affiche l'erreur retournée par l'API lors de la soumission", async () => {
    stubApi({ "/api/public/checkout": new Error("Cette catégorie est complète") });
    const user = userEvent.setup();
    render(<CheckoutForm slug="mon-gala" categories={CATEGORIES} />);
    await user.type(screen.getByLabelText("Nom complet (billet nominatif)"), "Grace Hopper");
    await user.type(screen.getByLabelText(/Email/), "grace@example.com");
    await user.click(screen.getByLabelText(/coordonnées soient utilisées/));
    await user.click(screen.getByRole("button", { name: /Payer/ }));

    await waitFor(() => expect(screen.getByText("Cette catégorie est complète")).toBeTruthy());
  });
});
