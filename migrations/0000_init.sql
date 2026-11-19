-- Trainer onboarding submissions.
--
-- One row per completed form. Bank details are stored as entered (plaintext),
-- per the project decision; access to this table and the uploaded files is the
-- only control, so keep the D1 database and R2 bucket private and hand the
-- ADMIN_TOKEN only to staff who need it.

CREATE TABLE submissions (
  id                TEXT PRIMARY KEY,

  region            TEXT NOT NULL,
  name              TEXT NOT NULL,

  postal_address    TEXT NOT NULL,
  pincode           TEXT NOT NULL,

  -- Geolocation captured from the browser at submit time (may be absent if the
  -- person declined the location prompt).
  latitude          REAL,
  longitude         REAL,
  geo_accuracy_m    REAL,
  geo_captured_at   INTEGER,

  has_laptop        INTEGER NOT NULL DEFAULT 0,  -- 0/1

  instagram         TEXT,
  facebook          TEXT,
  twitter           TEXT,

  bank_account_number TEXT NOT NULL,
  bank_ifsc           TEXT NOT NULL,

  -- R2 object keys for the uploaded files (NULL until uploaded).
  photo_key         TEXT,
  photo_type        TEXT,
  photo_size        INTEGER,

  passbook_key      TEXT,   -- passbook page / cancelled cheque
  passbook_type     TEXT,
  passbook_size     INTEGER,

  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX submissions_created_idx ON submissions (created_at);
CREATE INDEX submissions_region_idx  ON submissions (region);
