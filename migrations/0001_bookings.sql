CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  booking_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS bookings_dates_status
  ON bookings (status, pickup_date, return_date);

CREATE INDEX IF NOT EXISTS bookings_updated_at
  ON bookings (updated_at);

CREATE TABLE IF NOT EXISTS booking_attempts (
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS booking_attempts_client_time
  ON booking_attempts (ip_hash, created_at);
