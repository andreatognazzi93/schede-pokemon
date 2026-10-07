/** Shared character data and rules. No browser storage or DOM dependencies. */
export const STAT_KEYS = Object.freeze([
  'hp', 'attack', 'defense', 'specialAttack', 'specialDefense', 'speed',
]);

export const STAT_LABELS = Object.freeze({
  hp: 'HP',
  attack: 'Attacco',
  defense: 'Difesa',
  specialAttack: 'Attacco SP',
  specialDefense: 'Difesa SP',
  speed: 'Velocità',
});

const MAX_JSON_BYTES = 64 * 1024;
const MAX_ENCODED_LENGTH = 96 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function plainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

// Do not invoke accessors supplied by an imported object.
function ownValue(object, key) {
  if (!plainObject(object)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function arrayValue(array, index) {
  if (!Array.isArray(array)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(array, index);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function safeText(value, limit, fallback = '') {
  if (typeof value !== 'string') return fallback;
  let text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit);
  // A length limit must not leave half of a Unicode surrogate pair.
  const last = text.charCodeAt(text.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) text = text.slice(0, -1);
  return text;
}

function safeNumber(value, fallback, min, max, integer = false) {
  let number = value;
  if (typeof value === 'string' && value.trim() !== '') number = Number(value);
  if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max) {
    return fallback;
  }
  if (integer && !Number.isInteger(number)) return fallback;
  return number;
}

function safeScalar(value, fallback, textLimit, min = 0, max = 1e12) {
  if (typeof value === 'string') return safeText(value, textLimit);
  return safeNumber(value, fallback, min, max);
}

function newId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `pokemon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Normalize JSON-like imported data into a bounded, independent character object. */
export function normalizeCharacter(input) {
  if (!plainObject(input)) throw new TypeError('La scheda deve essere un oggetto JSON.');
  const get = (key) => ownValue(input, key);
  const rawStats = get('stats');
  const rawAbilities = get('abilities');
  const rawAbilityStats = get('abilityStats');
  const rawMoves = get('moves');
  const rawCurrency = get('currency');
  const stats = Object.fromEntries(STAT_KEYS.map((key) => [
    key, safeNumber(ownValue(rawStats, key), 10, 0, 999),
  ]));
  const moves = Array.from({ length: 4 }, (_, index) => {
    const move = arrayValue(rawMoves, index);
    return {
      name: safeText(ownValue(move, 'name'), 120),
      attack: safeText(ownValue(move, 'attack'), 120),
      damage: safeText(ownValue(move, 'damage'), 120),
      type: safeText(ownValue(move, 'type'), 80),
      notes: safeText(ownValue(move, 'notes'), 1500),
    };
  });
  return {
    id: safeText(get('id'), 100) || newId(),
    nickname: safeText(get('nickname'), 120),
    pokemon: safeText(get('pokemon'), 120),
    nature: safeText(get('nature'), 120),
    experience: safeNumber(get('experience'), 0, 0, 1e12),
    level: safeNumber(get('level'), 1, 1, 1000, true),
    stats,
    currentHP: safeNumber(get('currentHP'), 6, 0, 1e6),
    save: safeText(get('save'), 120),
    friendship: safeScalar(get('friendship'), 0, 120),
    proficiency: safeNumber(get('proficiency'), 2, -999, 999),
    power: safeText(get('power'), 6000),
    abilities: Array.from({ length: 14 }, (_, index) => safeText(
      arrayValue(rawAbilities, index), 500,
    )),
    abilityStats: Array.from({ length: 14 }, (_, index) => {
      const selected = arrayValue(rawAbilityStats, index);
      return typeof selected === 'string' && STAT_KEYS.includes(selected) ? selected : '';
    }),
    moves,
    appearance: safeText(get('appearance'), 6000),
    currency: Array.from({ length: 5 }, (_, index) => safeScalar(
      arrayValue(rawCurrency, index), 0, 80,
    )),
    equipment: safeText(get('equipment'), 6000),
    type: safeText(get('type'), 500),
    weakness: safeText(get('weakness'), 1000),
    resistance: safeText(get('resistance'), 1000),
    immunity: safeText(get('immunity'), 1000),
  };
}

/** Create a blank character, optionally supplying any initial fields. */
export function createCharacter(overrides = {}) {
  return normalizeCharacter(overrides);
}

function ruleNumber(value, fallback) {
  if (typeof value === 'string' && value.trim() !== '') value = Number(value);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Exact requested rules; calculated values are never clamped or persisted. */
export function calculate(character) {
  const modifiers = Object.fromEntries(STAT_KEYS.map((key) => [
    key, Math.floor((ruleNumber(character?.stats?.[key], 10) - 10) / 2),
  ]));
  const proficiency = ruleNumber(character?.proficiency, 2);
  return {
    modifiers,
    initiative: proficiency + modifiers.speed,
    armorClass: 10 + proficiency + modifiers.defense,
    maxHP: ruleNumber(character?.level, 1) * (6 + modifiers.hp),
    abilityModifiers: Array.from({ length: 14 }, (_, index) => {
      const selected = character?.abilityStats?.[index];
      return STAT_KEYS.includes(selected) ? modifiers[selected] + proficiency : null;
    }),
  };
}

export function formatModifier(value) {
  const number = ruleNumber(value, 0);
  return number >= 0 ? `+${number}` : `${number}`;
}

function toBase64Url(bytes) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(encoded) {
  if (!encoded || !/^[A-Za-z0-9_-]+$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error('Il link contiene dati non validi.');
  }
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
    + '='.repeat((4 - encoded.length % 4) % 4);
  let binary;
  try { binary = atob(padded); } catch { throw new Error('Il link contiene dati non validi.'); }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function readBounded(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel().catch(() => {});
        throw new Error('La scheda supera la dimensione massima consentita.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function byteStream(bytes) {
  return new ReadableStream({
    start(controller) { controller.enqueue(bytes); controller.close(); },
  });
}

/** A public snapshot contains sheet data, without its local storage identity. */
export async function encodeCharacter(character) {
  const normalized = normalizeCharacter(character);
  const { id, ...data } = normalized;
  const bytes = encoder.encode(JSON.stringify(data));
  if (bytes.length > MAX_JSON_BYTES) throw new Error('La scheda è troppo grande per il link.');
  let prefix = 'j1.';
  let payload = bytes;
  if (typeof CompressionStream === 'function' && typeof DecompressionStream === 'function') {
    try {
      const compressed = await readBounded(
        byteStream(bytes).pipeThrough(new CompressionStream('deflate')), MAX_JSON_BYTES,
      );
      if (compressed.length < bytes.length) {
        prefix = 'z1.';
        payload = compressed;
      }
    } catch {
      // Older browsers can still produce an interoperable plain UTF-8 snapshot.
    }
  }
  const encoded = prefix + toBase64Url(payload);
  if (encoded.length > MAX_ENCODED_LENGTH) throw new Error('La scheda è troppo grande per il link.');
  return encoded;
}

/** Decode versioned compressed/plain snapshots; unprefixed plain snapshots also work. */
export async function decodeCharacter(encoded) {
  if (typeof encoded !== 'string' || encoded.length > MAX_ENCODED_LENGTH) {
    throw new Error('Il link è troppo grande o non valido.');
  }
  let compressed = false;
  let payload = encoded;
  if (encoded.startsWith('z1.')) {
    compressed = true;
    payload = encoded.slice(3);
  } else if (encoded.startsWith('j1.')) {
    payload = encoded.slice(3);
  } else if (encoded.includes('.')) {
    throw new Error('La versione del link non è supportata.');
  }
  let bytes = fromBase64Url(payload);
  if (compressed) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Questo browser non supporta i link compressi. Usa un browser aggiornato.');
    }
    bytes = await readBounded(
      byteStream(bytes).pipeThrough(new DecompressionStream('deflate')), MAX_JSON_BYTES,
    );
  }
  if (bytes.byteLength > MAX_JSON_BYTES) throw new Error('La scheda è troppo grande.');
  let data;
  try { data = JSON.parse(decoder.decode(bytes)); } catch {
    throw new Error('Il link non contiene una scheda JSON valida.');
  }
  return normalizeCharacter(data);
}
