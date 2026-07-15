/*
 * Tests unitaires de l'application (js/app.js).
 * Fonctions pures : chartCsv (sérialisation CSV « format Excel FR » des séries
 * d'un graphique) et slug (identifiant de fichier à partir d'un titre).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadScript } from "./_sandbox.mjs";

const { chartCsv, slug } = loadScript("js/app.js");
const BOM = "﻿";

test("chartCsv : BOM, séparateur « ; », virgule décimale, axe d'années", () => {
  const cfg = {
    x: { label: "Année" },
    series: [
      { label: "A", points: [{ x: 2000, y: 1.5 }, { x: 2001, y: 2.5 }] },
      { label: "B", points: [{ x: 2000, y: 3 }] },
    ],
  };
  const csv = chartCsv(cfg);
  assert.ok(csv.startsWith(BOM), "doit commencer par un BOM UTF-8");
  assert.deepEqual(csv.slice(1).split("\r\n"), [
    "Année;A;B",
    "2000;1,5;3",
    "2001;2,5;", // B absent en 2001 → cellule vide
  ]);
});

test("chartCsv : arrondi à deux décimales", () => {
  const cfg = { series: [{ label: "V", points: [{ x: 2020, y: 3.14159 }] }] };
  const csv = chartCsv(cfg).slice(1);
  assert.equal(csv.split("\r\n")[1], "2020;3,14");
});

test("chartCsv : échappement des séparateurs et guillemets", () => {
  const cfg = {
    x: { label: "Année" },
    series: [{ label: 'A;"B"', points: [{ x: 2000, y: 1 }] }],
  };
  const header = chartCsv(cfg).slice(1).split("\r\n")[0];
  // « ; » et « " » dans le libellé → cellule entre guillemets, guillemets doublés.
  assert.equal(header, 'Année;"A;""B"""');
});

test("chartCsv : axe catégoriel (barres) — 1re colonne = libellé de catégorie", () => {
  const cfg = {
    categories: ["Femmes", "Hommes"],
    series: [{ label: "Part", points: [{ x: 0, y: 60 }, { x: 1, y: 40 }] }],
  };
  const csv = chartCsv(cfg).slice(1);
  assert.deepEqual(csv.split("\r\n"), ["Catégorie;Part", "Femmes;60", "Hommes;40"]);
});

test("chartCsv : ignore les séries vides", () => {
  const cfg = {
    x: { label: "Année" },
    series: [
      { label: "Pleine", points: [{ x: 2000, y: 1 }] },
      { label: "Vide", points: [] },
    ],
  };
  assert.equal(chartCsv(cfg).slice(1).split("\r\n")[0], "Année;Pleine");
});

test("slug : minuscules, accents retirés, séparateurs normalisés", () => {
  assert.equal(slug("Fécondité & productivité"), "fecondite-productivite");
});

test("slug : tirets de tête/fin supprimés", () => {
  assert.equal(slug("  Le déficit !  "), "le-deficit");
});

test("slug : repli « graphique » quand aucun caractère alphanumérique", () => {
  assert.equal(slug("!!! ??? ..."), "graphique");
});

test("slug : tronqué à 40 caractères", () => {
  const out = slug("a".repeat(60));
  assert.equal(out.length, 40);
});
