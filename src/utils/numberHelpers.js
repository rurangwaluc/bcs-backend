"use strict";

function toInt(v, def = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : def;
}

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

module.exports = { toInt, toNum };
