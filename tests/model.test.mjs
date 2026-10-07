import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STAT_KEYS, STAT_LABELS, createCharacter, normalizeCharacter,
  calculate, formatModifier, encodeCharacter, decodeCharacter,
} from '../model.mjs';

function withoutId(character) {
  const { id, ...data } = character;
  return data;
}

function plainSnapshot(data, prefix = 'j1.') {
  return prefix + Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}

test('blank characters have six Italian stats and independent fixed-size arrays', () => {
  const a = createCharacter();
  const b = createCharacter();
  assert.deepEqual(Object.keys(a.stats), STAT_KEYS);
  assert.equal(STAT_LABELS.specialAttack, 'Attacco SP');
  assert.equal(STAT_LABELS.speed, 'Velocità');
  assert.equal(a.abilities.length, 14);
  assert.deepEqual(a.abilityStats, Array(14).fill(''));
  assert.equal(a.moves.length, 4);
  assert.equal(a.currency.length, 5);
  assert.equal(a.power, '');
  assert.notEqual(a.id, b.id);
  a.stats.hp = 20;
  a.abilityStats[0] = 'hp';
  a.moves[0].name = 'Azione';
  assert.equal(b.stats.hp, 10);
  assert.equal(b.abilityStats[0], '');
  assert.equal(b.moves[0].name, '');
});

test('odd negative stat differences round down, including 9 → −1 and 7 → −2', () => {
  const character = createCharacter({
    stats: { hp: 9, attack: 7, defense: 11, specialAttack: 13, specialDefense: 1, speed: 8 },
  });
  assert.deepEqual(calculate(character), {
    modifiers: { hp: -1, attack: -2, defense: 0, specialAttack: 1, specialDefense: -5, speed: -1 },
    initiative: 1,
    armorClass: 10,
    maxHP: 5,
    abilityModifiers: Array(14).fill(null),
  });
  assert.equal(formatModifier(-2), '-2');
  assert.equal(formatModifier(0), '+0');
  assert.equal(formatModifier(3), '+3');
});

test('selected ability modifiers combine the chosen stat and proficiency and recalculate', () => {
  const character = createCharacter({
    proficiency: 3,
    stats: { hp: 9, attack: 7, speed: 14 },
    abilityStats: ['hp', 'attack', 'speed'],
  });
  assert.deepEqual(calculate(character).abilityModifiers.slice(0, 4), [2, 1, 5, null]);
  character.stats.hp = 11;
  character.proficiency = 4;
  assert.deepEqual(calculate(character).abilityModifiers.slice(0, 4), [4, 2, 6, null]);
  character.abilityStats[0] = 'defense';
  assert.equal(calculate(character).abilityModifiers[0], 4);
  character.abilityStats[0] = '';
  assert.equal(calculate(character).abilityModifiers[0], null);
});

test('armor class uses base 8 and adds proficiency and defense modifier', () => {
  const character = createCharacter({
    proficiency: 4,
    stats: { defense: 15, speed: 9 },
  });
  assert.equal(calculate(character).armorClass, 14);
  assert.equal(calculate(character).initiative, 3);
  character.proficiency = 5;
  assert.equal(calculate(character).armorClass, 15);
  assert.equal(calculate(character).initiative, 4);
});

test('ability stat selection accepts only exact stat keys and has exactly 14 slots', () => {
  const selection = ['HP', ' hp', 'attack ', 1, null, {}, 'speed', 'specialAttack'];
  const character = normalizeCharacter({ abilityStats: selection });
  assert.deepEqual(character.abilityStats, [
    '', '', '', '', '', '', 'speed', 'specialAttack', '', '', '', '', '', '',
  ]);
  assert.equal(calculate(character).abilityModifiers[6], 2);
  assert.equal(calculate(character).abilityModifiers[7], 2);
  assert.equal(normalizeCharacter({ abilityStats: 'speed' }).abilityStats[0], '');
  assert.equal(normalizeCharacter({ abilityStats: Array(20).fill('hp') }).abilityStats.length, 14);
});

test('level and HP changes recalculate maximum HP; current HP stays independent', () => {
  const character = createCharacter({ level: 9, currentHP: 37, stats: { hp: 14, defense: 14, speed: 8 } });
  assert.equal(calculate(character).maxHP, 72);
  assert.equal(calculate(character).armorClass, 12);
  assert.equal(calculate(character).initiative, 1);
  character.level = 10;
  assert.equal(calculate(character).maxHP, 80);
  character.stats.hp = 15;
  assert.equal(calculate(character).maxHP, 80);
  character.stats.hp = 16;
  assert.equal(calculate(character).maxHP, 90);
  assert.equal(character.currentHP, 37);
});

test('calculation applies the formula exactly, without clamping its result', () => {
  const result = calculate({ level: 3, stats: { hp: -20, defense: -20, speed: -20 } });
  assert.equal(result.maxHP, -27);
  assert.equal(result.armorClass, -5);
  assert.equal(result.initiative, -13);
});

test('invalid stat and numerical inputs become safe defaults', () => {
  const character = normalizeCharacter({
    level: 1.5,
    experience: Infinity,
    currentHP: NaN,
    proficiency: {},
    stats: { hp: '14', attack: 'nope', defense: -1, specialAttack: Infinity, specialDefense: {}, speed: 1000 },
  });
  assert.equal(character.level, 1);
  assert.equal(character.experience, 0);
  assert.equal(character.currentHP, 6);
  assert.equal(character.proficiency, 2);
  assert.deepEqual(character.stats, {
    hp: 14, attack: 10, defense: 10, specialAttack: 10, specialDefense: 10, speed: 10,
  });
  assert.equal(normalizeCharacter({ level: 0 }).level, 1);
  assert.equal(normalizeCharacter({ level: 1001 }).level, 1);
});

test('malformed top-level values are rejected and unknown/prototype properties dropped', () => {
  for (const malformed of [null, [], 'character', 12, true, new Date()]) {
    assert.throws(() => normalizeCharacter(malformed), TypeError);
  }
  const source = JSON.parse('{"nickname":"Tillo","__proto__":{"polluted":true},"unwanted":"data"}');
  const character = normalizeCharacter(source);
  assert.equal(character.nickname, 'Tillo');
  assert.equal(Object.hasOwn(character, '__proto__'), false);
  assert.equal(Object.hasOwn(character, 'unwanted'), false);
  assert.equal({}.polluted, undefined);
});

test('normalization bounds text, removes controls, and never invokes object accessors', () => {
  const source = { nickname: 'A\0B', appearance: 'x'.repeat(7000) };
  Object.defineProperty(source, 'pokemon', { get() { throw new Error('Unsafe accessor'); } });
  source.stats = {};
  Object.defineProperty(source.stats, 'hp', { get() { throw new Error('Unsafe accessor'); } });
  for (const key of ['moves', 'abilities', 'abilityStats', 'currency']) {
    source[key] = [];
    Object.defineProperty(source[key], 0, { get() { throw new Error('Unsafe accessor'); } });
  }
  const character = normalizeCharacter(source);
  assert.equal(character.nickname, 'AB');
  assert.equal(character.appearance.length, 6000);
  assert.equal(character.pokemon, '');
  assert.equal(character.stats.hp, 10);
  assert.equal(character.moves[0].name, '');
  assert.equal(character.abilities[0], '');
  assert.equal(character.abilityStats[0], '');
  assert.equal(character.currency[0], 0);
});

test('all move fields, multiline power, currencies, and ability lines survive normalization', () => {
  const move = { name: 'Foglia', attack: '+4', damage: '2d6 + 3', type: 'Erba', notes: 'Portata 10 m\nUna volta per turno.' };
  const character = normalizeCharacter({
    moves: [move],
    power: 'Potere Pokémon\nUna descrizione.',
    abilities: ['Atletica +3', 'Percezione +4'],
    currency: [12, '—', 3, '4', 0],
    friendship: '',
  });
  assert.deepEqual(character.moves[0], move);
  assert.equal(character.power, 'Potere Pokémon\nUna descrizione.');
  assert.deepEqual(character.currency, [12, '—', 3, '4', 0]);
  assert.equal(character.friendship, '');
  assert.equal(character.abilities[1], 'Percezione +4');
  move.name = 'Changed';
  assert.equal(character.moves[0].name, 'Foglia');
});

test('Unicode character snapshot round-trips every user field and gets a new local identity', async () => {
  const source = createCharacter({
    nickname: 'Tìllo 🐢', pokemon: 'Torterra', nature: 'Gentile', level: 9,
    stats: { hp: 14, attack: 13, defense: 14, specialAttack: 16, specialDefense: 12, speed: 8 },
    currentHP: 37, proficiency: 4, save: '+5',
    power: 'È già pronto!\n能力 ✨', appearance: 'Un Pokémon dalle foglie verdi.',
    equipment: 'Pozione ×2\nCorda', type: 'Erba / Terra',
    abilityStats: ['speed', 'specialDefense', '', 'hp'],
    moves: [{ name: 'Gigassorbimento', attack: '+7', damage: '3d6', type: 'Erba', notes: 'Recupera metà dei danni.' }],
  });
  const encoded = await encodeCharacter(source);
  assert.match(encoded, /^[jz]1\.[A-Za-z0-9_-]+$/);
  const decoded = await decodeCharacter(encoded);
  assert.deepEqual(withoutId(decoded), withoutId(source));
  assert.notEqual(decoded.id, source.id);
});

test('plain UTF-8 snapshots and unprefixed legacy snapshots decode', async () => {
  const input = { nickname: 'Pokémon 🌿', equipment: 'Pietra ×3' };
  const prefixed = await decodeCharacter(plainSnapshot(input));
  assert.equal(prefixed.nickname, input.nickname);
  assert.deepEqual(prefixed.abilityStats, Array(14).fill(''));
  assert.equal((await decodeCharacter(plainSnapshot(input, ''))).equipment, input.equipment);
});

test('plain encoding fallback works when CompressionStream is unavailable', async () => {
  const original = globalThis.CompressionStream;
  try {
    globalThis.CompressionStream = undefined;
    const character = createCharacter({ nickname: 'Évoli 🦊' });
    const encoded = await encodeCharacter(character);
    assert.match(encoded, /^j1\./);
    assert.deepEqual(withoutId(await decodeCharacter(encoded)), withoutId(character));
  } finally {
    globalThis.CompressionStream = original;
  }
});

test('invalid, oversized, unsupported, and malformed share snapshots are rejected', async () => {
  await assert.rejects(decodeCharacter('j1.!notbase64'));
  await assert.rejects(decodeCharacter('z9.anything'));
  await assert.rejects(decodeCharacter('j1.a'));
  await assert.rejects(decodeCharacter('x'.repeat(100000)));
  await assert.rejects(decodeCharacter(plainSnapshot([])), TypeError);
  await assert.rejects(decodeCharacter(plainSnapshot('not a character')), TypeError);
  await assert.rejects(decodeCharacter('j1.' + Buffer.from([0xff, 0xfe]).toString('base64url')));
  await assert.rejects(decodeCharacter(plainSnapshot({ appearance: 'x'.repeat(70000) })));
});

test('bounded decompression rejects a highly compressed oversized document', async () => {
  const input = new TextEncoder().encode(JSON.stringify({ appearance: 'x'.repeat(1000000) }));
  const stream = new ReadableStream({ start(controller) { controller.enqueue(input); controller.close(); } })
    .pipeThrough(new CompressionStream('deflate'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  const encoded = 'z1.' + Buffer.from(bytes).toString('base64url');
  assert.ok(encoded.length < 2000);
  await assert.rejects(decodeCharacter(encoded), /dimensione massima/);
});
