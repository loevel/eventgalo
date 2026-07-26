import { describe, expect, it } from "vitest";
import { ApiError, formatDate, formatPrice } from "@/lib/api";

describe("formatPrice", () => {
  it("affiche « Gratuit » pour un montant nul", () => {
    expect(formatPrice(0)).toBe("Gratuit");
  });

  it("convertit les cents en devise CAD par défaut", () => {
    // Espace insécable potentiellement différente selon l'ICU du runtime :
    // on vérifie le contenu plutôt que l'égalité stricte de la chaîne.
    const result = formatPrice(5000);
    expect(result).toContain("50,00");
    expect(result).toContain("$");
  });

  it("respecte la devise fournie", () => {
    expect(formatPrice(1000, "USD")).toContain("10,00");
  });
});

describe("formatDate", () => {
  it("affiche un tiret pour une date absente", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
  });

  it("formate une date ISO en français canadien", () => {
    const formatted = formatDate("2026-07-23T19:30:00.000Z");
    expect(formatted).toContain("2026");
    expect(formatted).not.toBe("—");
  });
});

describe("ApiError", () => {
  it("porte le statut HTTP en plus du message", () => {
    const err = new ApiError("Événement introuvable", 404);
    expect(err.message).toBe("Événement introuvable");
    expect(err.status).toBe(404);
    expect(err).toBeInstanceOf(Error);
  });
});
