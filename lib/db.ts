import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import path from 'node:path';
import { mkdirSync } from 'node:fs';

type DB = { query: (sql: string, params?: unknown[]) => Promise<{rows: any[]}> };
const globalDb = globalThis as unknown as { citasDb?: DB; citasReady?: Promise<void> };
export function db(): DB {
  if (!globalDb.citasDb) {
    if (process.env.DATABASE_URL) globalDb.citasDb = new Pool({connectionString:process.env.DATABASE_URL});
    else {
      if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
      const directory=process.env.LOCAL_DB_PATH || path.join(process.cwd(), '.data', 'postgres');
      mkdirSync(directory,{recursive:true});
      globalDb.citasDb = new PGlite(directory);
    }
  }
  return globalDb.citasDb;
}
export async function ready() {
  if (!globalDb.citasReady) globalDb.citasReady = (async () => {
    for (const sql of [
      `CREATE TABLE IF NOT EXISTS settings (id integer PRIMARY KEY CHECK(id=1), name text NOT NULL DEFAULT 'La Princesa de las Cejas', description text NOT NULL DEFAULT 'Un momento para ti. Una mirada que te representa.', address text NOT NULL DEFAULT 'Medellín, Colombia', phone text NOT NULL DEFAULT '+573217168203', open_time text NOT NULL DEFAULT '09:00', close_time text NOT NULL DEFAULT '18:00', weekdays integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}')`,
      `ALTER TABLE settings ADD COLUMN IF NOT EXISTS schedule jsonb`,
      `INSERT INTO settings(id) VALUES(1) ON CONFLICT DO NOTHING`,
      `CREATE TABLE IF NOT EXISTS services (id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', price integer NOT NULL CHECK(price>=0), duration integer NOT NULL CHECK(duration BETWEEN 5 AND 480), buffer integer NOT NULL DEFAULT 0 CHECK(buffer BETWEEN 0 AND 120), active boolean NOT NULL DEFAULT true)`,
      `CREATE TABLE IF NOT EXISTS bookings (id uuid PRIMARY KEY, service_id integer REFERENCES services(id), service_name text NOT NULL, price integer NOT NULL, customer text NOT NULL, phone text NOT NULL, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled','completed')), kind text NOT NULL DEFAULT 'appointment' CHECK(kind IN ('appointment','block')), created_at timestamptz NOT NULL DEFAULT now(), CHECK(end_at>start_at), EXCLUDE USING gist (tstzrange(start_at,end_at,'[)') WITH &&) WHERE (status <> 'cancelled'))`,
      `CREATE INDEX IF NOT EXISTS bookings_start_idx ON bookings(start_at)`,
      `CREATE TABLE IF NOT EXISTS notification_config (id integer PRIMARY KEY CHECK(id=1), config jsonb NOT NULL DEFAULT '{}', secrets text NOT NULL DEFAULT '', vapid text NOT NULL DEFAULT '')`,
      `INSERT INTO notification_config(id) VALUES(1) ON CONFLICT DO NOTHING`,
      `CREATE TABLE IF NOT EXISTS push_devices (id uuid PRIMARY KEY, endpoint text UNIQUE NOT NULL, subscription jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`,
      `CREATE TABLE IF NOT EXISTS notification_jobs (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, booking_id uuid REFERENCES bookings(id), channel text NOT NULL, target text NOT NULL, status text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0, next_at timestamptz NOT NULL DEFAULT now(), error text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(booking_id,channel,target))`,
      `CREATE OR REPLACE FUNCTION enqueue_booking_notifications() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='appointment' AND NEW.status='confirmed' THEN INSERT INTO notification_jobs(booking_id,channel,target) SELECT NEW.id,'email',config->>'emailTo' FROM notification_config WHERE config->>'emailEnabled'='true' UNION ALL SELECT NEW.id,'whatsapp',config->>'whatsappTo' FROM notification_config WHERE config->>'whatsappEnabled'='true' UNION ALL SELECT NEW.id,'push',id::text FROM push_devices; END IF; RETURN NEW; END $$`,
      `CREATE OR REPLACE TRIGGER booking_notifications AFTER INSERT ON bookings FOR EACH ROW EXECUTE FUNCTION enqueue_booking_notifications()`
    ]) await db().query(sql);
  })();
  await globalDb.citasReady;
}
export async function query(sql:string, params:unknown[] = []) { await ready(); return (await db().query(sql,params)).rows; }
