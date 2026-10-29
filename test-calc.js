// Tests für src/rechnen.js und src/abgleich.js gegen die Handrechnungen aus scope.md. Aufruf: node test-calc.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('./src/rechnen.js');

let zaehler = 0;
const id = () => 'id' + (++zaehler);
const strich = (personId, getraenkId, preisCent, extra = {}) => Object.assign({
  id: id(), personId, getraenkId, preisCent, zeit: '2026-10-01T12:00:00.000Z', storniert: false, abschlussId: null,
}, extra);

const personen = [
  { id: 'A', name: 'Person A', archiviert: false, beispiel: false },
  { id: 'B', name: 'Person B', archiviert: false, beispiel: false },
];
const getraenke = [
  { id: 'wasser', name: 'Wasser', preisCent: 80, reihenfolge: 0 },
  { id: 'bier', name: 'Bier', preisCent: 150, reihenfolge: 1 },
];

// Handrechnung 1: 3 × 80 + 2 × 120 = 480 ct
const fallA = [
  strich('A', 'wasser', 80), strich('A', 'wasser', 80), strich('A', 'wasser', 80),
  strich('A', 'bier', 120), strich('A', 'bier', 120),
];
// Handrechnung 2: 2 × 120, Preis auf 150, 2 × 150, einer storniert: 390 ct
const fallB = [
  strich('B', 'bier', 120), strich('B', 'bier', 120),
  strich('B', 'bier', 150), strich('B', 'bier', 150, { storniert: true }),
];

test('Handrechnung 1: einfache Summe ergibt 480 ct = 4,80 €', () => {
  assert.equal(R.summePerson(fallA, 'A'), 480);
  assert.equal(R.formatEuro(R.summePerson(fallA, 'A')), '4,80 €');
  const erg = R.abrechnung(fallA, personen, getraenke);
  assert.deepEqual(erg.proPerson.A.anzahlProGetraenk, { wasser: 3, bier: 2 });
  assert.equal(erg.proPerson.A.summeCent, 480);
});

test('Handrechnung 2: Preisänderung und Storno ergibt 390 ct, gesamt 870 ct', () => {
  assert.equal(R.summePerson(fallB, 'B'), 390);
  assert.equal(R.formatEuro(390), '3,90 €');
  const erg = R.abrechnung(fallA.concat(fallB), personen, getraenke);
  assert.equal(erg.proPerson.B.summeCent, 390);
  assert.equal(erg.proPerson.B.anzahlProGetraenk.bier, 3);
  assert.equal(erg.proPerson.B.summeProGetraenk.bier, 390);
  assert.equal(erg.gesamtCent, 870);
  assert.equal(R.formatEuro(erg.gesamtCent), '8,70 €');
  assert.deepEqual(erg.anzahlProGetraenk, { wasser: 3, bier: 5 });
});

test('Handrechnung 3: Preisvorschlag 18,99 € für 20 Flaschen', () => {
  assert.equal(R.preisVorschlag(1899, 20, 5), 95);
  assert.equal(R.preisVorschlag(1899, 20, 10), 100);
  assert.equal(R.formatCtUngerundet(1899, 20), '94,95 ct');
  // glatt teilbar wird nicht aufgerundet
  assert.equal(R.preisVorschlag(1900, 20, 5), 95);
  assert.equal(R.preisVorschlag(1800, 20, 10), 90);
  assert.equal(R.preisVorschlag(1899, 0, 5), 0);
});

test('Randfälle der Summe', () => {
  assert.equal(R.summePerson([], 'A'), 0);
  assert.equal(R.abrechnung([], personen, getraenke).gesamtCent, 0);
  const nurStorno = [strich('A', 'bier', 120, { storniert: true }), strich('A', 'wasser', 80, { storniert: true })];
  assert.equal(R.summePerson(nurStorno, 'A'), 0);
  assert.equal(R.abrechnung(nurStorno, personen, getraenke).gesamtCent, 0);
  assert.equal(R.abrechnung(nurStorno, personen, getraenke).zeilen.length, 0);
});

test('archivierte Person mit offenen Strichen bleibt in der Abrechnung', () => {
  const pers = [{ id: 'C', name: 'Archiv', archiviert: true }];
  const erg = R.abrechnung([strich('C', 'wasser', 80)], pers, getraenke);
  assert.equal(erg.zeilen.length, 1);
  assert.equal(erg.zeilen[0].name, 'Archiv');
  assert.equal(erg.zeilen[0].summeCent, 80);
});

test('formatEuro', () => {
  assert.equal(R.formatEuro(5), '0,05 €');
  assert.equal(R.formatEuro(0), '0,00 €');
  assert.equal(R.formatEuro(123456), '1.234,56 €');
  assert.equal(R.formatEuro(-250), '-2,50 €');
});

test('parseEuro', () => {
  assert.equal(R.parseEuro('1,20'), 120);
  assert.equal(R.parseEuro('1.2'), 120);
  assert.equal(R.parseEuro('0,95 €'), 95);
  assert.equal(R.parseEuro('18,99'), 1899);
  assert.equal(R.parseEuro('3'), 300);
  assert.equal(R.parseEuro(''), null);
  assert.equal(R.parseEuro('abc'), null);
  assert.equal(R.parseEuro('1,234'), null);
});

test('Abschluss ordnet nur offene, nicht stornierte Striche zu', () => {
  const alt = strich('A', 'bier', 120, { abschlussId: 'alt' });
  const storno = strich('A', 'bier', 120, { storniert: true });
  const offen1 = strich('A', 'wasser', 80);
  const offen2 = strich('B', 'bier', 150);
  const alle = [alt, storno, offen1, offen2];
  const r = R.abschliessen(alle, { id: 'neu', von: null, bis: null, erstellt: '2026-10-31T18:00:00.000Z' });
  const nach = new Map(r.striche.map(s => [s.id, s]));
  assert.equal(nach.get(alt.id).abschlussId, 'alt');
  assert.equal(nach.get(storno.id).abschlussId, null);
  assert.equal(nach.get(offen1.id).abschlussId, 'neu');
  assert.equal(nach.get(offen2.id).abschlussId, 'neu');
  assert.equal(r.geaendert.length, 2);
  assert.deepEqual(r.abschluss.bezahlt, { A: false, B: false });
  // Eingabe bleibt unverändert
  assert.equal(offen1.abschlussId, null);
  // danach ist nichts mehr offen
  assert.equal(R.summePerson(R.offeneStriche(r.striche), 'A'), 0);
});

test('Abschluss mit Zeitraum nimmt nur Striche darin', () => {
  const frueh = strich('A', 'bier', 120, { zeit: '2026-09-15T10:00:00.000Z' });
  const spaet = strich('A', 'bier', 120, { zeit: '2026-10-15T10:00:00.000Z' });
  const r = R.abschliessen([frueh, spaet], { id: 'x', von: '2026-10-01T00:00:00.000Z', bis: '2026-10-31T23:59:59.999Z' });
  assert.equal(r.geaendert.length, 1);
  assert.equal(r.geaendert[0].id, spaet.id);
});

test('Export und Re-Import ergeben identische Daten', () => {
  const daten = {
    personen, getraenke,
    striche: fallA.concat(fallB),
    abschluesse: [{ id: 'ab1', von: null, bis: null, erstellt: '2026-10-01T00:00:00.000Z', bezahlt: { A: true } }],
    meta: { schemaVersion: 1, demoGeladen: false },
  };
  const exp = R.exportObjekt(daten, '2026-10-28T10:00:00.000Z');
  assert.equal(exp.format, 'strich');
  assert.equal(exp.version, 1);
  const zurueck = R.pruefeImport(JSON.parse(JSON.stringify(exp)));
  assert.equal(zurueck.ok, true);
  assert.deepEqual(zurueck.daten, daten);
  assert.deepEqual(zurueck.vorschau, { personen: 2, getraenke: 2, striche: 9 });
});

test('Import mit falschem Format oder neuerer Version wird abgelehnt', () => {
  const gut = R.exportObjekt({ personen: [], getraenke: [], striche: [], abschluesse: [] }, 'x');
  assert.equal(R.pruefeImport(gut).ok, true);
  assert.equal(R.pruefeImport(Object.assign({}, gut, { format: 'zaehler' })).ok, false);
  const neuer = R.pruefeImport(Object.assign({}, gut, { version: 2 }));
  assert.equal(neuer.ok, false);
  assert.match(neuer.fehler, /neueren Version/);
  assert.equal(R.pruefeImport(Object.assign({}, gut, { version: 'eins' })).ok, false);
  assert.equal(R.pruefeImport(null).ok, false);
  assert.equal(R.pruefeImport({ format: 'strich', version: 1, daten: { personen: [] } }).ok, false);
});

test('Dateiname des Exports', () => {
  assert.equal(R.exportDateiname(new Date(2026, 9, 5)), 'strich-export-2026-10-05.json');
});

test('CSV der Abrechnung', () => {
  const erg = R.abrechnung(fallA.concat(fallB), personen, getraenke);
  const csv = R.abrechnungCsv(erg, getraenke);
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  assert.deepEqual(csv.slice(1).trim().split('\r\n'), [
    'person;getraenk;anzahl;summe_euro',
    'Person A;Wasser;3;2,40',
    'Person A;Bier;2;2,40',
    'Person B;Bier;3;3,90',
    'gesamt;;8;8,70',
  ]);
  const komisch = R.abrechnungCsv(R.abrechnung([strich('X', 'wasser', 80)], [{ id: 'X', name: 'Max; "M"' }], getraenke), getraenke);
  assert.match(komisch, /^﻿person.*\r\n"Max; ""M""";Wasser;1;0,80\r\n/);
});

test('Demodaten sind markiert und mit einem Schritt entfernbar', () => {
  let n = 0;
  const demo = R.demoDaten(new Date('2026-10-28T12:00:00Z'), () => 'd' + (++n));
  assert.ok(demo.personen.length > 0 && demo.personen.every(p => p.beispiel));
  assert.ok(demo.getraenke.every(g => g.beispiel));
  const eigene = { id: 'E', name: 'Echt', beispiel: false };
  const daten = {
    personen: demo.personen.concat([eigene]),
    getraenke: demo.getraenke.concat(getraenke),
    striche: demo.striche.concat([strich('E', 'wasser', 80)]),
    abschluesse: [],
  };
  const sauber = R.ohneBeispiel(daten);
  assert.deepEqual(sauber.personen, [eigene]);
  assert.deepEqual(sauber.getraenke, getraenke);
  assert.equal(sauber.striche.length, 1);
  assert.equal(R.summePerson(sauber.striche, 'E'), 80);
});

test('eigene Striche auf Beispielgetränken und Beispielpersonen überleben das Entfernen', () => {
  let n = 0;
  const demo = R.demoDaten(new Date('2026-10-28T12:00:00Z'), () => 'd' + (++n));
  const [anna, ben] = demo.personen;
  const [wasser, bier] = demo.getraenke;
  const eigene = { id: 'E', name: 'Echt', archiviert: false, beispiel: false };
  // Eigener Strich von E auf Beispiel-Bier (120 ct), eigener Strich von Anna auf Beispiel-Wasser (80 ct)
  const s1 = strich('E', bier.id, 120, { abschlussId: 'A1' });
  const s2 = strich(anna.id, wasser.id, 80);
  // Abschluss A1 mit eigenem und Beispielstrich, Abschluss A2 nur mit Beispielstrich
  demo.striche[0].abschlussId = 'A1';
  demo.striche[1].abschlussId = 'A2';
  const daten = {
    personen: demo.personen.concat([eigene]),
    getraenke: demo.getraenke,
    striche: demo.striche.concat([s1, s2]),
    abschluesse: [
      { id: 'A1', von: null, bis: null, erstellt: '2026-10-01T00:00:00.000Z', bezahlt: { E: true, [anna.id]: false, [ben.id]: true } },
      { id: 'A2', von: null, bis: null, erstellt: '2026-10-02T00:00:00.000Z', bezahlt: {} },
    ],
  };
  const sauber = R.ohneBeispiel(daten);
  assert.deepEqual(sauber.striche, [s1, s2]);
  assert.deepEqual(sauber.personen.map(p => p.id).sort(), ['E', anna.id].sort());
  assert.deepEqual(sauber.getraenke.map(g => g.id).sort(), [wasser.id, bier.id].sort());
  assert.ok(sauber.personen.every(p => p.beispiel === false));
  assert.ok(sauber.getraenke.every(g => g.beispiel === false));
  assert.deepEqual(sauber.abschluesse.map(a => a.id), ['A1']);
  assert.deepEqual(sauber.abschluesse[0].bezahlt, { E: true, [anna.id]: false });
  // 120 + 80 = 200 ct bleiben erhalten
  const ab = R.abrechnung(sauber.striche, sauber.personen, sauber.getraenke);
  assert.equal(ab.gesamtCent, 200);
  // Eingabe bleibt unverändert
  assert.equal(daten.personen.length, 5);
  assert.ok(anna.beispiel);
});

/* ---------- Abgleich per Link (src/abgleich.js) ---------- */
const A = require('./src/abgleich.js');

// Handrechnung 4 aus scope.md: zwei Handys, ein Abend
function abend() {
  const pers = [
    { id: 'anna', name: 'Anna', archiviert: false, beispiel: false },
    { id: 'ben', name: 'Ben', archiviert: false, beispiel: false },
  ];
  const getr = [
    { id: 'w', name: 'Wasser', preisCent: 80, archiviert: false, beispiel: false, reihenfolge: 0 },
    { id: 'b', name: 'Bier', preisCent: 120, archiviert: false, beispiel: false, reihenfolge: 1 },
  ];
  const s = (sid, p, g, preis, extra) => Object.assign({ id: sid, personId: p, getraenkId: g, preisCent: preis,
    zeit: '2026-10-31T19:00:00.000Z', storniert: false, abschlussId: null }, extra || {});
  return { pers, getr, s };
}
const T = '2026-10-31T20:00:00.000Z';
const ueber = (lokal, quelle) => {
  const r = A.paketPruefen(JSON.parse(JSON.stringify(A.paketBauen(quelle, T))));
  assert.equal(r.ok, true);
  return A.zusammenfuehren(lokal, r.daten);
};
const gesamt = d => R.abrechnung(R.offeneStriche(d.striche), d.personen, d.getraenke).gesamtCent;

test('Handrechnung 4: zwei Handys führen zu 480 ct, Storno danach zu 400 ct', () => {
  const { pers, getr, s } = abend();
  // Handy 1 (lädt ein): Anna 1 Bier
  let h1 = { personen: pers, getraenke: getr, striche: [s('s1', 'anna', 'b', 120)], abschluesse: [] };
  // Handy 2 öffnet die Einladung
  let h2 = ueber({ personen: [], getraenke: [], striche: [], abschluesse: [] }, h1).daten;
  assert.equal(gesamt(h2), 120);
  // danach parallel: Handy 2 Ben 2 Wasser, Anna 1 Wasser; Handy 1 Ben 1 Bier
  h2 = Object.assign({}, h2, { striche: h2.striche.concat([s('s2', 'ben', 'w', 80), s('s3', 'ben', 'w', 80), s('s4', 'anna', 'w', 80)]) });
  h1 = Object.assign({}, h1, { striche: h1.striche.concat([s('s5', 'ben', 'b', 120)]) });
  // Handy 2 schickt seinen Stand zurück
  const r = ueber(h1, h2);
  assert.deepEqual(r.bericht, { neuePersonen: 0, neueGetraenke: 0, neueStriche: 3, neuStorniert: 0, gleicheNamen: [] });
  h1 = r.daten;
  // Anna 120 + 80 = 200, Ben 120 + 2 × 80 = 280, gesamt 480
  assert.equal(R.summePerson(h1.striche, 'anna'), 200);
  assert.equal(R.summePerson(h1.striche, 'ben'), 280);
  assert.equal(gesamt(h1), 480);
  // derselbe Link noch einmal ändert nichts
  const nochmal = ueber(h1, h2);
  assert.equal(nochmal.geaendert.striche.length, 0);
  assert.equal(gesamt(nochmal.daten), 480);
  // Handy 2 storniert einen Wasserstrich von Ben und schickt erneut: 480 minus 80 = 400
  h2 = Object.assign({}, h2, { striche: h2.striche.map(x => (x.id === 's3' ? Object.assign({}, x, { storniert: true }) : x)) });
  const st = ueber(h1, h2);
  assert.equal(st.bericht.neuStorniert, 1);
  h1 = st.daten;
  assert.equal(R.summePerson(h1.striche, 'ben'), 200);
  assert.equal(gesamt(h1), 400);
  // Handy 1 schickt seinen Stand an Handy 2: beide zeigen 400
  h2 = ueber(h2, h1).daten;
  assert.equal(gesamt(h2), 400);
  assert.equal(h2.striche.length, h1.striche.length);
});

test('Abgleich: Storno wird nie zurückgenommen, abgerechnete Striche bleiben unberührt', () => {
  const { pers, getr, s } = abend();
  const lokal = { personen: pers, getraenke: getr, striche: [s('x1', 'anna', 'b', 120, { storniert: true }), s('x2', 'ben', 'b', 120, { abschlussId: 'ab' })], abschluesse: [] };
  const paket = { personen: pers, getraenke: getr, striche: [s('x1', 'anna', 'b', 120), s('x2', 'ben', 'b', 120, { storniert: true })] };
  const r = A.zusammenfuehren(lokal, paket);
  assert.equal(r.geaendert.striche.length, 0);
  assert.equal(r.daten.striche[0].storniert, true);
  assert.equal(r.daten.striche[1].storniert, false);
  assert.equal(r.daten.striche[1].abschlussId, 'ab');
  // Eingabe bleibt unverändert
  assert.equal(lokal.striche.length, 2);
});

test('Abgleich: bekannte Personen behalten ihren Namen, neue mit gleichem Namen werden gemeldet', () => {
  const { pers, getr } = abend();
  const lokal = { personen: pers, getraenke: getr, striche: [], abschluesse: [] };
  const paket = {
    personen: [{ id: 'anna', name: 'Anna M.', archiviert: false, beispiel: false }, { id: 'anna2', name: 'anna', archiviert: false, beispiel: false }],
    getraenke: [{ id: 'mate', name: 'Mate', preisCent: 150, archiviert: false, beispiel: false }],
    striche: [],
  };
  const r = A.zusammenfuehren(lokal, paket);
  assert.equal(r.daten.personen.find(p => p.id === 'anna').name, 'Anna');
  assert.deepEqual(r.bericht.gleicheNamen, ['anna']);
  assert.equal(r.bericht.neuePersonen, 1);
  assert.equal(r.daten.getraenke.find(g => g.id === 'mate').reihenfolge, 2);
});

test('Abgleich: Paket enthält nur offene Striche und die nötigen Personen und Getränke', () => {
  const { pers, getr, s } = abend();
  const arch = { id: 'alt', name: 'Alt', archiviert: true, beispiel: false };
  const archLeer = { id: 'weg', name: 'Weg', archiviert: true, beispiel: false };
  const daten = { personen: pers.concat([arch, archLeer]), getraenke: getr,
    striche: [s('o1', 'alt', 'w', 80), s('o2', 'ben', 'b', 120, { storniert: true }), s('a1', 'anna', 'b', 120, { abschlussId: 'ab' })] };
  const p = A.paketBauen(daten, T);
  assert.deepEqual(p.p.map(x => x[0]), ['anna', 'ben', 'alt']);
  assert.deepEqual(p.s.map(x => x[0]), ['o1', 'o2']);
  assert.deepEqual(p.s[0], ['o1', 2, 0, 80, Date.parse('2026-10-31T19:00:00.000Z'), 0, 0]);
  assert.equal(p.s[1][5], 1);
});

test('Testvektor: kleines Paket als Link-Code (ungepackt)', async () => {
  const paket = { f: 'strich-abgleich', v: 1, t: T, p: [['p1', 'Max Muster', 0, 0]], g: [['g1', 'Wasser', 80, 0, 0]], s: [['s1', 0, 0, 80, 1793473200000, 0, 0]] };
  const code = await A.kodieren(paket, { packen: false });
  assert.equal(code, 'j' + Buffer.from(JSON.stringify(paket)).toString('base64url'));
  const r = await A.dekodieren('https://example.org/strich/#abgleich/' + code);
  assert.equal(r.ok, true);
  assert.deepEqual(r.daten.striche, [{ id: 's1', personId: 'p1', getraenkId: 'g1', preisCent: 80, zeit: '2026-10-31T19:00:00.000Z', storniert: false, abschlussId: null }]);
});

test('Link-Code gepackt hin und zurück, auch mit Umlauten', async () => {
  const { pers, getr, s } = abend();
  const viele = [];
  for (let i = 0; i < 60; i++) viele.push(s('strich-' + i, i % 2 ? 'anna' : 'ben', i % 3 ? 'w' : 'b', i % 3 ? 80 : 120));
  const daten = { personen: pers.concat([{ id: 'u', name: 'Jürgen Ölmüller', archiviert: false, beispiel: false }]), getraenke: getr, striche: viele };
  const code = await A.kodieren(A.paketBauen(daten, T));
  assert.equal(code[0], 'z');
  const ungepackt = await A.kodieren(A.paketBauen(daten, T), { packen: false });
  assert.ok(code.length < ungepackt.length);
  const r = await A.dekodieren(code);
  assert.equal(r.ok, true);
  assert.equal(r.daten.personen[2].name, 'Jürgen Ölmüller');
  assert.equal(R.abrechnung(r.daten.striche, r.daten.personen, r.daten.getraenke).gesamtCent, 20 * 120 + 40 * 80);
});

test('kaputte oder fremde Links werden mit Meldung abgelehnt', async () => {
  assert.equal((await A.dekodieren('')).ok, false);
  assert.match((await A.dekodieren('kaputt')).fehler, /kein Link von strich/);
  assert.equal((await A.dekodieren('#abgleich/z!!!')).ok, false);
  assert.equal((await A.dekodieren('zAAAA')).ok, false);
  assert.equal((await A.dekodieren('x' + A.base64urlKodieren(new TextEncoder().encode('{}')))).ok, false);
  const neuer = await A.dekodieren(await A.kodieren({ f: 'strich-abgleich', v: 2, p: [], g: [], s: [] }, { packen: false }));
  assert.match(neuer.fehler, /neueren Version/);
  assert.equal(A.paketPruefen({ f: 'strich-abgleich', v: 1, p: [], g: [], s: [['s', 0, 0, 80, 0, 0, 0]] }).ok, false);
  assert.equal(A.paketPruefen({ f: 'strich', v: 1, p: [], g: [], s: [] }).ok, false);
  // abgeschnittener gepackter Link
  const code = await A.kodieren(A.paketBauen({ personen: abend().pers, getraenke: abend().getr, striche: [] }, T));
  assert.equal((await A.dekodieren(code.slice(0, code.length - 10))).ok, false);
});

test('base64url hin und zurück für alle Restlängen', () => {
  for (let n = 0; n < 8; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 97 + 13) & 255);
    const t = A.base64urlKodieren(bytes);
    assert.equal(t, Buffer.from(bytes).toString('base64url'));
    assert.deepEqual(Array.from(A.base64urlDekodieren(t)), Array.from(bytes));
  }
});
