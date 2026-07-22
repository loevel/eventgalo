"use client";

import { useEffect, useRef, useState } from "react";

interface PhotonFeature {
  properties: {
    name?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    country?: string;
  };
}

function formatFeature(f: PhotonFeature): string {
  const p = f.properties;
  const parts: string[] = [];
  if (p.name) parts.push(p.name);
  const streetLine = [p.housenumber, p.street].filter(Boolean).join(" ");
  if (streetLine && streetLine !== p.name) parts.push(streetLine);
  if (p.city) parts.push(p.city);
  if (p.state) parts.push(p.state);
  if (p.country) parts.push(p.country);
  return parts.join(", ");
}

/**
 * Champ adresse avec suggestions via Photon (OpenStreetMap) — gratuit, sans clé,
 * mais serveur communautaire best-effort : tout échec réseau est silencieux,
 * le champ reste un input texte normal.
 */
export function AddressAutocomplete({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  function handleChange(next: string) {
    onChange(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(next)}&limit=5&lang=fr`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { features?: PhotonFeature[] };
        const labels = (data.features ?? []).map(formatFeature).filter(Boolean);
        setSuggestions(labels);
        setOpen(labels.length > 0);
      } catch {
        // Best-effort : pas de suggestion, le champ reste utilisable normalement.
      }
    }, 300);
  }

  function select(label: string) {
    onChange(label);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div className="address-autocomplete">
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(suggestions.length > 0)}
        onBlur={() => {
          blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={placeholder ?? "123 rue…, Montréal"}
        autoComplete="off"
      />
      {open && suggestions.length > 0 && (
        <ul className="address-autocomplete-dropdown">
          {suggestions.map((label, i) => (
            <li
              key={i}
              className="address-autocomplete-item"
              onMouseDown={(e) => {
                e.preventDefault();
                select(label);
              }}
            >
              {label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
