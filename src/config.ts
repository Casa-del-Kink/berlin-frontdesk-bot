import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import "dotenv/config";

export interface Service {
  name: string;
  durationMin: number;
  price: string;
}

export interface Client {
  name: string;
  timezone: string;
  language: string;
  calendarId: string;
  ownerWhatsapp: string;
  hours: { days: number[]; open: string; close: string };
  services: Service[];
  faq: { q: string; a: string }[];
  tone: string;
}

export function loadClient(): Client {
  const file = process.env.CLIENT_FILE || "clients/salon-demo.yaml";
  const cfg = yaml.load(readFileSync(file, "utf8")) as Client;
  if (!cfg?.name || !cfg?.services?.length) {
    throw new Error(`Invalid config in ${file}`);
  }
  return cfg;
}

// Loose match by name (what the customer types won't be exact).
export function findService(cfg: Client, text: string): Service | undefined {
  const t = (text || "").toLowerCase().trim();
  if (!t) return undefined;
  return (
    cfg.services.find((s) => s.name.toLowerCase() === t) ||
    cfg.services.find((s) => s.name.toLowerCase().includes(t) || t.includes(s.name.toLowerCase()))
  );
}
