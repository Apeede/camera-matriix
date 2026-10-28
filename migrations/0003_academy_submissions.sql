CREATE TABLE IF NOT EXISTS academy_submissions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submission_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS academy_submissions_created_at
  ON academy_submissions (created_at);

CREATE INDEX IF NOT EXISTS academy_submissions_updated_at
  ON academy_submissions (updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS academy_newsletter_email
  ON academy_submissions (email) WHERE type = 'newsletter';
