import { createHash } from "crypto";

/** Keep letters from any alphabet and digits. Drop spaces, dashes, and the wildcard. */
export function normalizePlate(input: string): string {
  return input.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * The lock's OCR does not send a confidence. A complete plate is trusted.
 * A broken or symbol-heavy read waits for the driver. A reported score,
 * including the demo buttons, is used as-is.
 */
export function readConfidence(raw: string, reported?: number): number {
  if (typeof reported === "number" && Number.isFinite(reported)) {
    return Math.min(1, Math.max(0, reported));
  }
  const kept = normalizePlate(raw);
  if (!validPlate(kept)) return 0.4;
  const letters = raw.match(/\p{L}|\p{N}/gu)?.join("") ?? "";
  if (letters.toUpperCase() !== kept) return 0.7;
  return 0.95;
}

export function platesMatch(booked: string | null, seen: string): boolean {
  if (!booked) return false;
  return normalizePlate(booked) === normalizePlate(seen);
}

export function maskPlate(input: string): string {
  const plate = normalizePlate(input);
  if (plate.length <= 3) return "•••";
  const hidden = Math.max(2, plate.length - 3);
  return `${plate.slice(0, 1)}${"•".repeat(hidden)}${plate.slice(-2)}`;
}

export function hashPlate(normalized: string): string {
  const salt = process.env.PLATE_HASH_SALT || "watt-demo-salt-change-me";
  return createHash("sha256").update(`${salt}:${normalized}`).digest("hex");
}

export function validPlate(input: string): boolean {
  const plate = normalizePlate(input);
  return plate.length >= 4 && plate.length <= 12;
}

/* ---------- Ecurious card (second check-in key) ---------- */

/** Card ids (RFID UID or printed number): letters and digits only, upper case. */
export function normalizeCard(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function validCard(input: string): boolean {
  const card = normalizeCard(input);
  return card.length >= 4 && card.length <= 32;
}

/** Same salted hash as plates, in its own namespace so a card can never match a plate. */
export function hashCard(input: string): string {
  return hashPlate(`card:${normalizeCard(input)}`);
}

export function maskCard(input: string): string {
  return `•••• ${normalizeCard(input).slice(-4)}`;
}
