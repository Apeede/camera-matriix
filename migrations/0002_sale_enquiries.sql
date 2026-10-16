CREATE TABLE IF NOT EXISTS sale_enquiries (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  enquiry_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sale_enquiries_created_at
  ON sale_enquiries (created_at);

CREATE INDEX IF NOT EXISTS sale_enquiries_updated_at
  ON sale_enquiries (updated_at);
