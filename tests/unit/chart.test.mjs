/*
 * Tests unitaires du moteur de graphique (js/chart.js).
 * Fonctions pures : niceTicks (graduations d'axe) et clipSegment (découpe
 * Liang-Barsky d'un segment contre la zone de tracé).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScript } from "./_sandbox.mjs";

const { niceTicks, clipSegment } = loadScript("js/chart.js");

test("niceTicks : graduations « rondes » couvrant l'intervalle", () => {
  const ticks = niceTicks(0, 10, 5);
  assert.deepEqual(ticks, [0, 2, 4, 6, 8, 10]);
});

test("niceTicks : ne sort jamais des bornes [min, max]", () => {
  const ticks = niceTicks(2.3, 9.7, 5);
  assert.ok(ticks.every(t => t >= 2.3 && t <= 9.7), `hors bornes : ${ticks}`);
  assert.ok(ticks.length >= 2);
});

test("niceTicks : pas arrondi à une valeur 1/2/5 × 10^n", () => {
  // span 100 / 5 = 20 (brut) → pas normalisé 2 → pas = 20.
  const ticks = niceTicks(0, 100, 5);
  assert.deepEqual(ticks, [0, 20, 40, 60, 80, 100]);
});

test("niceTicks : intervalle négatif géré", () => {
  const ticks = niceTicks(-10, 10, 4);
  assert.ok(ticks.includes(0));
  assert.ok(ticks[0] >= -10 && ticks[ticks.length - 1] <= 10);
});

test("clipSegment : segment entièrement dans la zone → inchangé, sans bord", () => {
  const s = clipSegment(1, 1, 2, 2, 0, 10, 0, 10);
  assert.ok(s);
  assert.deepEqual([s.x1, s.y1, s.x2, s.y2], [1, 1, 2, 2]);
  assert.equal(s.entry, false);
  assert.equal(s.exit, false);
});

test("clipSegment : segment entièrement hors zone → null", () => {
  assert.equal(clipSegment(20, 20, 30, 30, 0, 10, 0, 10), null);
});

test("clipSegment : segment entrant par la gauche → point d'entrée découpé", () => {
  // (-5,5) → (5,5), rectangle [0,10]×[0,10] : entre à x=0, reste dedans à droite.
  const s = clipSegment(-5, 5, 5, 5, 0, 10, 0, 10);
  assert.ok(s);
  assert.equal(s.x1, 0);
  assert.equal(s.y1, 5);
  assert.deepEqual([s.x2, s.y2], [5, 5]);
  assert.equal(s.entry, true);
  assert.equal(s.exit, false);
});

test("clipSegment : segment traversant de part en part → entrée ET sortie", () => {
  const s = clipSegment(-5, 5, 15, 5, 0, 10, 0, 10);
  assert.ok(s);
  assert.deepEqual([s.x1, s.x2], [0, 10]);
  assert.equal(s.entry, true);
  assert.equal(s.exit, true);
});
