export const paymentSchema=[
 `CREATE TABLE IF NOT EXISTS payment_qr (id integer PRIMARY KEY CHECK(id=1), content bytea NOT NULL, mime text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS payment_config (id integer PRIMARY KEY CHECK(id=1), enabled boolean NOT NULL DEFAULT false, manual_enabled boolean NOT NULL DEFAULT false, instructions text NOT NULL DEFAULT '', online_enabled boolean NOT NULL DEFAULT false, public_key text NOT NULL DEFAULT '', secrets text NOT NULL DEFAULT '', hold_hours integer NOT NULL DEFAULT 24 CHECK(hold_hours BETWEEN 1 AND 72))`,
 `INSERT INTO payment_config(id) VALUES(1) ON CONFLICT DO NOTHING`,
 `ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_mode text NOT NULL DEFAULT 'none' CHECK(deposit_mode IN ('none','fixed','percent'))`,
 `ALTER TABLE services ADD COLUMN IF NOT EXISTS deposit_value integer NOT NULL DEFAULT 0 CHECK(deposit_value>=0)`,
 `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount integer NOT NULL DEFAULT 0 CHECK(deposit_amount>=0)`,
 `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'not_required'`,
 `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT ''`,
 `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_due_at timestamptz`,
 `ALTER TABLE bookings ADD COLUMN IF NOT EXISTS paid_at timestamptz`,
 `ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check`,
 `ALTER TABLE bookings ADD CONSTRAINT bookings_status_check CHECK(status IN ('pending_payment','confirmed','cancelled','completed'))`,
 `CREATE TABLE IF NOT EXISTS payment_receipts (booking_id uuid PRIMARY KEY REFERENCES bookings(id), content bytea NOT NULL, mime text NOT NULL, reference text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS payment_attempts (reference uuid PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), amount integer NOT NULL, environment text NOT NULL, public_key text NOT NULL, transaction_id text UNIQUE, status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now())`,
 `CREATE TABLE IF NOT EXISTS payment_audit (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id), action text NOT NULL, note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now())`
];
