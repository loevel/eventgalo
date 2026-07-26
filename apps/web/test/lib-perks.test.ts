import { describe, expect, it } from "vitest";
import { parsePerks } from "@/lib/perks";

describe("parsePerks", () => {
  it("retourne un tableau vide pour une valeur absente ou vide", () => {
    expect(parsePerks(null)).toEqual([]);
    expect(parsePerks(undefined)).toEqual([]);
    expect(parsePerks("")).toEqual([]);
  });

  it("accepte directement un tableau et filtre les valeurs vides", () => {
    expect(parsePerks(["Coupe de bienvenue", "", "Accès VIP"])).toEqual([
      "Coupe de bienvenue",
      "Accès VIP",
    ]);
  });

  it("désérialise une chaîne JSON valide", () => {
    expect(parsePerks(JSON.stringify(["Photobooth", "Vestiaire"]))).toEqual([
      "Photobooth",
      "Vestiaire",
    ]);
  });

  it("retourne un tableau vide pour du JSON invalide", () => {
    expect(parsePerks("{not valid json")).toEqual([]);
  });

  it("retourne un tableau vide si le JSON parsé n'est pas un tableau", () => {
    expect(parsePerks(JSON.stringify({ foo: "bar" }))).toEqual([]);
  });
});
