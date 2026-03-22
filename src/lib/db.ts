import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH || './data/gasoil.db';
const resolvedPath = path.resolve(process.cwd(), DB_PATH);

// Ensure data directory exists
const dataDir = path.dirname(resolvedPath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(resolvedPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stations (
      id INTEGER PRIMARY KEY,
      ideess TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      locality TEXT,
      province TEXT,
      lat REAL,
      lon REAL,
      address TEXT
    );

    CREATE TABLE IF NOT EXISTS route_stations (
      route_id TEXT NOT NULL,
      station_ideess TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (route_id, station_ideess)
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      station_ideess TEXT NOT NULL,
      date TEXT NOT NULL,
      gasoleo_a REAL,
      gasoleo_b REAL,
      gasolina_95 REAL,
      adblue REAL,
      UNIQUE(station_ideess, date)
    );

    CREATE INDEX IF NOT EXISTS idx_price_history_station ON price_history(station_ideess);
    CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(date);
    CREATE INDEX IF NOT EXISTS idx_route_stations_route ON route_stations(route_id);
  `);
}

export interface Station {
  id?: number;
  ideess: string;
  name: string;
  brand: string;
  locality: string;
  province: string;
  lat: number;
  lon: number;
  address: string;
}

export interface RouteStation {
  route_id: string;
  station_ideess: string;
  position: number;
}

export interface PriceHistory {
  id?: number;
  station_ideess: string;
  date: string;
  gasoleo_a: number | null;
  gasoleo_b: number | null;
  gasolina_95: number | null;
  adblue: number | null;
}

export interface StationWithPrice extends Station {
  gasoleo_a: number | null;
  gasoleo_b: number | null;
  gasolina_95: number | null;
  adblue: number | null;
  last_updated: string | null;
  trend: 'up' | 'down' | 'stable' | 'unknown';
  position: number;
}

export function upsertStation(station: Station): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO stations (ideess, name, brand, locality, province, lat, lon, address)
    VALUES (@ideess, @name, @brand, @locality, @province, @lat, @lon, @address)
    ON CONFLICT(ideess) DO UPDATE SET
      name = excluded.name,
      brand = excluded.brand,
      locality = excluded.locality,
      province = excluded.province,
      lat = excluded.lat,
      lon = excluded.lon,
      address = excluded.address
  `).run(station);
}

export function upsertRouteStation(routeStation: RouteStation): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO route_stations (route_id, station_ideess, position)
    VALUES (@route_id, @station_ideess, @position)
  `).run(routeStation);
}

export function upsertPriceHistory(price: PriceHistory): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO price_history (station_ideess, date, gasoleo_a, gasoleo_b, gasolina_95, adblue)
    VALUES (@station_ideess, @date, @gasoleo_a, @gasoleo_b, @gasolina_95, @adblue)
    ON CONFLICT(station_ideess, date) DO UPDATE SET
      gasoleo_a = excluded.gasoleo_a,
      gasoleo_b = excluded.gasoleo_b,
      gasolina_95 = excluded.gasolina_95,
      adblue = excluded.adblue
  `).run(price);
}

export function getStationsForRoute(routeId: string): StationWithPrice[] {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const stations = db.prepare(`
    SELECT
      s.*,
      rs.position,
      ph_today.gasoleo_a,
      ph_today.gasoleo_b,
      ph_today.gasolina_95,
      ph_today.adblue,
      ph_today.date as last_updated,
      ph_week.gasoleo_a as gasoleo_a_week,
      ph_week.gasoleo_b as gasoleo_b_week
    FROM route_stations rs
    JOIN stations s ON s.ideess = rs.station_ideess
    LEFT JOIN price_history ph_today ON ph_today.station_ideess = s.ideess
      AND ph_today.date = (
        SELECT MAX(date) FROM price_history WHERE station_ideess = s.ideess
      )
    LEFT JOIN price_history ph_week ON ph_week.station_ideess = s.ideess
      AND ph_week.date = (
        SELECT MAX(date) FROM price_history
        WHERE station_ideess = s.ideess AND date <= ?
      )
    WHERE rs.route_id = ?
    ORDER BY rs.position ASC
  `).all(sevenDaysAgo, routeId) as (Station & {
    position: number;
    gasoleo_a: number | null;
    gasoleo_b: number | null;
    gasolina_95: number | null;
    adblue: number | null;
    last_updated: string | null;
    gasoleo_a_week: number | null;
  })[];

  return stations.map((s) => {
    let trend: 'up' | 'down' | 'stable' | 'unknown' = 'unknown';
    if (s.gasoleo_a !== null && s.gasoleo_a_week !== null) {
      const diff = s.gasoleo_a - s.gasoleo_a_week;
      if (diff > 0.02) trend = 'up';
      else if (diff < -0.02) trend = 'down';
      else trend = 'stable';
    }
    return {
      id: s.id,
      ideess: s.ideess,
      name: s.name,
      brand: s.brand,
      locality: s.locality,
      province: s.province,
      lat: s.lat,
      lon: s.lon,
      address: s.address,
      position: s.position,
      gasoleo_a: s.gasoleo_a,
      gasoleo_b: s.gasoleo_b,
      gasolina_95: s.gasolina_95,
      adblue: s.adblue,
      last_updated: s.last_updated,
      trend,
    };
  });
}

export function getPriceHistory(ideess: string, days = 30): PriceHistory[] {
  const db = getDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
  return db.prepare(`
    SELECT * FROM price_history
    WHERE station_ideess = ? AND date >= ?
    ORDER BY date DESC
  `).all(ideess, since) as PriceHistory[];
}

export function getLastUpdateTime(): string | null {
  const db = getDb();
  const result = db.prepare(`
    SELECT MAX(date) as last_date FROM price_history
  `).get() as { last_date: string | null };
  return result?.last_date ?? null;
}

export function getRouteStationCount(routeId: string): number {
  const db = getDb();
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM route_stations WHERE route_id = ?
  `).get(routeId) as { count: number };
  return result.count;
}

export function clearRouteStations(routeId?: string): void {
  const db = getDb();
  if (routeId) {
    db.prepare(`DELETE FROM route_stations WHERE route_id = ?`).run(routeId);
  } else {
    db.prepare(`DELETE FROM route_stations`).run();
  }
}

export function getAllTrackedStationIds(): string[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT station_ideess FROM route_stations
  `).all() as { station_ideess: string }[];
  return rows.map((r) => r.station_ideess);
}
