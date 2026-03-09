"use strict";

const PRODUCT_CATEGORIES = [
  "GENERAL_HARDWARE",
  "FASTENERS",
  "TOOLS",
  "POWER_TOOLS",
  "ELECTRICAL",
  "PLUMBING",
  "PAINT",
  "BUILDING_MATERIALS",
  "SAFETY",
  "PPE",
  "APPAREL",
  "FOOTWEAR",
  "RAIN_GEAR",
  "ACCESSORIES",
  "OTHER",
];

const PRODUCT_UNITS = [
  "PIECE",
  "PAIR",
  "SET",
  "BOX",
  "PACK",
  "BUNDLE",
  "ROLL",
  "METER",
  "CENTIMETER",
  "MILLIMETER",
  "KILOGRAM",
  "GRAM",
  "LITER",
  "MILLILITER",
  "SHEET",
  "BAG",
  "CARTON",
  "DOZEN",
];

function cleanText(value, max = 255) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.slice(0, max);
}

function normalizeCategory(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase();

  if (!v) return "GENERAL_HARDWARE";
  return PRODUCT_CATEGORIES.includes(v) ? v : "GENERAL_HARDWARE";
}

function normalizeUnit(value) {
  const v = String(value || "")
    .trim()
    .toUpperCase();

  if (!v) return "PIECE";
  return PRODUCT_UNITS.includes(v) ? v : "PIECE";
}

function normalizePositiveInt(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  return Math.trunc(n);
}

function normalizeAttributes(value) {
  if (value == null) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  return null;
}

function buildDisplayName(data = {}) {
  const parts = [
    cleanText(data.name, 180),
    cleanText(data.brand, 80),
    cleanText(data.model, 80),
    cleanText(data.size, 40),
    cleanText(data.color, 40),
    cleanText(data.material, 80),
    cleanText(data.variantSummary, 200),
  ].filter(Boolean);

  return parts.join(" ").trim() || null;
}

module.exports = {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  cleanText,
  normalizeCategory,
  normalizeUnit,
  normalizePositiveInt,
  normalizeAttributes,
  buildDisplayName,
};
