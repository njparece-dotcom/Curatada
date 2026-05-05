CREATE TABLE IF NOT EXISTS pursuit_findings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  pursuit_type    VARCHAR(10) NOT NULL CHECK (pursuit_type IN ('guitar','watch')),
  pursuit_id      UUID        NOT NULL,
  source          VARCHAR(100) NOT NULL,
  title           TEXT,
  url             TEXT        NOT NULL,
  price           NUMERIC(10,2),
  condition       VARCHAR(255),
  location        VARCHAR(255),
  days_listed     INTEGER,
  listed_at       TIMESTAMPTZ,
  image_url       TEXT,
  extra           JSONB       DEFAULT '{}',
  first_seen_at   TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ DEFAULT NOW(),

  -- Deduplicate by URL within a pursuit
  CONSTRAINT pursuit_findings_unique_url UNIQUE (pursuit_type, pursuit_id, url)
);

CREATE INDEX IF NOT EXISTS idx_pursuit_findings_pursuit
  ON pursuit_findings (pursuit_type, pursuit_id);

CREATE INDEX IF NOT EXISTS idx_pursuit_findings_seen
  ON pursuit_findings (last_seen_at DESC);
