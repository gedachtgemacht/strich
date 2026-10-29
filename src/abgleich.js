/* strich. Abgleich per Link: mehrere Handys am selben Abend, ohne Server.
   Der ganze offene Stand steckt im Link hinter dem #, das geht nie an einen Server.
   Reine Funktionen bis auf kodieren/dekodieren, die nur die eingebaute Kompression nutzen.
   Läuft im Browser (window.Abgleich) und in Node (require). */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.Abgleich = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'strich-abgleich';
  const VERSION = 1;
  const MARKE = '#abgleich/';

  const offen = s => s.abschlussId === null || s.abschlussId === undefined;
  const b = x => (x ? 1 : 0);

  /**
   * Paket aus dem lokalen Stand: alle offenen Striche (auch stornierte, damit das Storno mitwandert),
   * alle nicht archivierten Personen und Getränke und dazu jene, auf die ein offener Strich zeigt.
   * Striche verweisen über die Position in p und g, das hält den Link kurz.
   */
  function paketBauen(daten, jetztIso) {
    const striche = (daten.striche || []).filter(offen);
    const pIds = new Set(striche.map(s => s.personId));
    const gIds = new Set(striche.map(s => s.getraenkId));
    const personen = (daten.personen || []).filter(p => !p.archiviert || pIds.has(p.id));
    const getraenke = (daten.getraenke || []).filter(g => !g.archiviert || gIds.has(g.id))
      .slice().sort((x, y) => (x.reihenfolge || 0) - (y.reihenfolge || 0));
    const pIdx = new Map(personen.map((p, i) => [p.id, i]));
    const gIdx = new Map(getraenke.map((g, i) => [g.id, i]));
    return {
      f: FORMAT, v: VERSION, t: jetztIso,
      p: personen.map(p => [p.id, p.name, b(p.archiviert), b(p.beispiel)]),
      g: getraenke.map(g => [g.id, g.name, g.preisCent, b(g.archiviert), b(g.beispiel)]),
      s: striche.filter(s => pIdx.has(s.personId) && gIdx.has(s.getraenkId))
        .map(s => [s.id, pIdx.get(s.personId), gIdx.get(s.getraenkId), s.preisCent, Date.parse(s.zeit), b(s.storniert), b(s.beispiel)]),
    };
  }

  const istText = x => typeof x === 'string' && x.length > 0 && x.length <= 200;
  const istBit = x => x === 0 || x === 1;
  const istIndex = (x, n) => Number.isInteger(x) && x >= 0 && x < n;

  /** Prüft ein entpacktes Paket. Liefert { ok, fehler } oder { ok, daten: { personen, getraenke, striche }, erstellt }. */
  function paketPruefen(obj) {
    if (!obj || typeof obj !== 'object' || obj.f !== FORMAT) return { ok: false, fehler: 'Das ist kein Link von strich.' };
    if (!Number.isInteger(obj.v) || obj.v < 1) return { ok: false, fehler: 'Unbekannte Version des Links.' };
    if (obj.v > VERSION) return { ok: false, fehler: 'Der Link stammt aus einer neueren Version von strich (Version ' + obj.v + '). Bitte aktualisiere die App.' };
    if (!Array.isArray(obj.p) || !Array.isArray(obj.g) || !Array.isArray(obj.s)) return { ok: false, fehler: 'Der Link ist unvollständig.' };
    const personen = [], getraenke = [], striche = [];
    for (const x of obj.p) {
      if (!Array.isArray(x) || !istText(x[0]) || !istText(x[1]) || !istBit(x[2]) || !istBit(x[3])) return { ok: false, fehler: 'Eine Person im Link ist beschädigt.' };
      personen.push({ id: x[0], name: x[1], archiviert: x[2] === 1, beispiel: x[3] === 1 });
    }
    for (const x of obj.g) {
      if (!Array.isArray(x) || !istText(x[0]) || !istText(x[1]) || !Number.isInteger(x[2]) || x[2] < 0 || !istBit(x[3]) || !istBit(x[4])) return { ok: false, fehler: 'Ein Getränk im Link ist beschädigt.' };
      getraenke.push({ id: x[0], name: x[1], preisCent: x[2], archiviert: x[3] === 1, beispiel: x[4] === 1 });
    }
    for (const x of obj.s) {
      if (!Array.isArray(x) || !istText(x[0]) || !istIndex(x[1], personen.length) || !istIndex(x[2], getraenke.length)
        || !Number.isInteger(x[3]) || x[3] < 0 || !Number.isFinite(x[4]) || !istBit(x[5]) || !istBit(x[6])) return { ok: false, fehler: 'Ein Strich im Link ist beschädigt.' };
      const s = { id: x[0], personId: personen[x[1]].id, getraenkId: getraenke[x[2]].id, preisCent: x[3],
        zeit: new Date(x[4]).toISOString(), storniert: x[5] === 1, abschlussId: null };
      if (x[6] === 1) s.beispiel = true;
      striche.push(s);
    }
    return { ok: true, daten: { personen, getraenke, striche }, erstellt: typeof obj.t === 'string' ? obj.t : null };
  }

  const namenSchluessel = n => n.trim().toLocaleLowerCase('de');

  /**
   * Führt ein geprüftes Paket in den lokalen Stand. Regeln:
   * unbekannte Personen, Getränke und Striche kommen dazu (Kennung entscheidet, nicht der Name);
   * bekannte Personen und Getränke behalten ihren lokalen Stand;
   * ein Storno wandert mit, solange der Strich hier noch offen ist; ein Storno wird nie zurückgenommen;
   * abgerechnete Striche bleiben unberührt.
   * Mehrfaches Zusammenführen desselben Pakets ändert nichts mehr.
   * Liefert neue Listen, die geänderten Objekte zum Speichern und einen Bericht. Die Eingabe bleibt unverändert.
   */
  function zusammenfuehren(lokal, paket) {
    const personen = lokal.personen.slice();
    const getraenke = lokal.getraenke.slice();
    const striche = lokal.striche.slice();
    const geaendert = { personen: [], getraenke: [], striche: [] };
    const bericht = { neuePersonen: 0, neueGetraenke: 0, neueStriche: 0, neuStorniert: 0, gleicheNamen: [] };

    const pIds = new Set(personen.map(p => p.id));
    const pNamen = new Set(personen.map(p => namenSchluessel(p.name)));
    for (const p of paket.personen) {
      if (pIds.has(p.id)) continue;
      if (pNamen.has(namenSchluessel(p.name))) bericht.gleicheNamen.push(p.name);
      const neu = { id: p.id, name: p.name, archiviert: p.archiviert, beispiel: p.beispiel, erstellt: paket.erstellt || null };
      personen.push(neu); geaendert.personen.push(neu); pIds.add(p.id); bericht.neuePersonen++;
    }

    const gIds = new Set(getraenke.map(g => g.id));
    const gNamen = new Set(getraenke.map(g => namenSchluessel(g.name)));
    let reihe = getraenke.reduce((m, g) => Math.max(m, g.reihenfolge || 0), -1);
    for (const g of paket.getraenke) {
      if (gIds.has(g.id)) continue;
      if (gNamen.has(namenSchluessel(g.name))) bericht.gleicheNamen.push(g.name);
      const neu = { id: g.id, name: g.name, preisCent: g.preisCent, archiviert: g.archiviert, beispiel: g.beispiel, reihenfolge: ++reihe };
      getraenke.push(neu); geaendert.getraenke.push(neu); gIds.add(g.id); bericht.neueGetraenke++;
    }

    const sPos = new Map(striche.map((s, i) => [s.id, i]));
    for (const s of paket.striche) {
      if (!sPos.has(s.id)) {
        const neu = Object.assign({}, s, { abschlussId: null });
        sPos.set(s.id, striche.length);
        striche.push(neu); geaendert.striche.push(neu); bericht.neueStriche++;
        continue;
      }
      const i = sPos.get(s.id);
      const alt = striche[i];
      if (s.storniert && !alt.storniert && offen(alt)) {
        const neu = Object.assign({}, alt, { storniert: true });
        striche[i] = neu; geaendert.striche.push(neu); bericht.neuStorniert++;
      }
    }
    return { daten: Object.assign({}, lokal, { personen, getraenke, striche }), geaendert, bericht };
  }

  /* ---------- base64url ohne Abhängigkeiten ---------- */
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const RUECK = (() => { const m = {}; for (let i = 0; i < 64; i++) m[ALPHABET[i]] = i; return m; })();

  function base64urlKodieren(bytes) {
    let t = '';
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      t += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63];
    }
    const rest = bytes.length - i;
    if (rest === 1) { const n = bytes[i] << 16; t += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63]; }
    else if (rest === 2) { const n = (bytes[i] << 16) | (bytes[i + 1] << 8); t += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63]; }
    return t;
  }

  /** Liefert Uint8Array oder null bei ungültigen Zeichen. */
  function base64urlDekodieren(text) {
    if (text.length % 4 === 1) return null;
    const aus = new Uint8Array(Math.floor(text.length * 3 / 4));
    let n = 0, bits = 0, j = 0;
    for (const c of text) {
      const w = RUECK[c];
      if (w === undefined) return null;
      n = (n << 6) | w; bits += 6;
      if (bits >= 8) { bits -= 8; aus[j++] = (n >> bits) & 255; }
    }
    return aus.subarray(0, j);
  }

  async function durchStrom(bytes, strom) {
    const antwort = new Response(new Blob([bytes]).stream().pipeThrough(strom));
    return new Uint8Array(await antwort.arrayBuffer());
  }

  const kannPacken = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  /**
   * Paket als Text für den Link. Erstes Zeichen: z = deflate-raw gepackt, j = nur JSON.
   * Ohne eingebaute Kompression (alte Browser) oder mit { packen: false } entsteht die j-Form.
   */
  async function kodieren(paket, optionen) {
    const roh = new TextEncoder().encode(JSON.stringify(paket));
    const packen = !(optionen && optionen.packen === false) && kannPacken();
    if (packen) {
      try { return 'z' + base64urlKodieren(await durchStrom(roh, new CompressionStream('deflate-raw'))); } catch (e) { /* weiter ungepackt */ }
    }
    return 'j' + base64urlKodieren(roh);
  }

  /** Holt den Code aus einem ganzen Link oder aus dem nackten Code. */
  function codeAusText(text) {
    if (typeof text !== 'string') return '';
    const t = text.trim();
    const i = t.indexOf(MARKE);
    return (i >= 0 ? t.slice(i + MARKE.length) : t).replace(/\s/g, '');
  }

  /** Text oder Link zurück zum geprüften Paket: { ok, fehler } oder wie paketPruefen. */
  async function dekodieren(text) {
    const code = codeAusText(text);
    if (code.length < 2) return { ok: false, fehler: 'Der Link ist leer oder abgeschnitten.' };
    if (code[0] !== 'z' && code[0] !== 'j') return { ok: false, fehler: 'Das ist kein Link von strich.' };
    const bytes = base64urlDekodieren(code.slice(1));
    if (!bytes) return { ok: false, fehler: 'Der Link enthält ungültige Zeichen. Kopiere ihn bitte vollständig.' };
    let roh;
    if (code[0] === 'z') {
      if (!kannPacken()) return { ok: false, fehler: 'Dieser Browser kann den gepackten Link nicht öffnen. Aktualisiere den Browser.' };
      try { roh = await durchStrom(bytes, new DecompressionStream('deflate-raw')); } catch (e) { return { ok: false, fehler: 'Der Link ist beschädigt oder abgeschnitten.' }; }
    } else roh = bytes;
    let obj;
    try { obj = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(roh)); } catch (e) { return { ok: false, fehler: 'Der Link ist beschädigt oder abgeschnitten.' }; }
    return paketPruefen(obj);
  }

  return {
    FORMAT, VERSION, MARKE,
    paketBauen, paketPruefen, zusammenfuehren,
    base64urlKodieren, base64urlDekodieren, kodieren, dekodieren, codeAusText,
  };
});
