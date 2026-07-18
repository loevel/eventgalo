-- Vitrines sponsors : le niveau de mise en avant dépend du palier acheté.

-- 'logo' = logo seul (actuel) · 'standard' = logo + description + liens
-- · 'full' = carte spotlight : carrousel photos, vidéo, contacts, réseaux sociaux.
ALTER TABLE sponsor_tiers ADD COLUMN showcase TEXT NOT NULL DEFAULT 'logo'
  CHECK (showcase IN ('logo','standard','full'));

-- Profil public rempli par le sponsor depuis son espace /sp/<token>.
ALTER TABLE sponsors ADD COLUMN description TEXT;
ALTER TABLE sponsors ADD COLUMN address TEXT;
ALTER TABLE sponsors ADD COLUMN phone TEXT;
ALTER TABLE sponsors ADD COLUMN public_email TEXT;
ALTER TABLE sponsors ADD COLUMN video_url TEXT;   -- YouTube/Vimeo uniquement (validé côté API)
ALTER TABLE sponsors ADD COLUMN socials TEXT;      -- JSON {facebook, instagram, linkedin, x, tiktok, youtube}

-- Photos de vitrine d'un sponsor (max 6, servies via /api/public/media/:id/file).
ALTER TABLE media ADD COLUMN sponsor_id TEXT REFERENCES sponsors(id);
