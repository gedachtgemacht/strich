/* strich. Rechenlogik: reine Funktionen ohne DOM und ohne Speicherzugriff.
   Läuft im Browser (window.Rechnen) und in Node (require). Alle Beträge in ganzen Cent. */
(function (wurzel, fabrik) {
  if (typeof module === 'object' && module.exports) module.exports = fabrik();
  else wurzel.Rechnen = fabrik();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FORMAT = 'strich';
  const VERSION = 1;
  const STORES = ['personen', 'getraenke', 'striche', 'abschluesse'];

  // zählt: nicht storniert
  const zaehlt = s => !s.storniert;
  // offen: zählt und noch keinem Abschluss zugeordnet
  const istOffen = s => zaehlt(s) && (s.abschlussId === null || s.abschlussId === undefined);

  /** Summe aller nicht stornierten Striche einer Person in Cent. */
  function summePerson(striche, personId) {
    let summe = 0;
    for (const s of striche) if (s.personId === personId && zaehlt(s)) summe += s.preisCent;
    return summe;
  }

  /** Nur offene Striche (nicht storniert, ohne Abschluss). */
  function offeneStriche(striche) {
    return striche.filter(istOffen);
  }

  /** Striche im Zeitraum [von, bis], beide als ISO-String oder null (offen). */
  function imZeitraum(striche, von, bis) {
    const a = von ? Date.parse(von) : -Infinity;
    const b = bis ? Date.parse(bis) : Infinity;
    return striche.filter(s => { const t = Date.parse(s.zeit); return t >= a && t <= b; });
  }

  /**
   * Abrechnung über die übergebenen Striche. Stornierte zählen nicht.
   * Liefert pro Person { anzahlProGetraenk, summeProGetraenk, anzahl, summeCent } und gesamtCent.
   * Personen erscheinen, sobald sie mindestens einen zählenden Strich haben, auch wenn sie archiviert sind.
   */
  function abrechnung(striche, personen, getraenke) {
    const proPerson = {};
    const anzahlProGetraenk = {};
    let gesamtCent = 0;
    let anzahl = 0;
    for (const s of striche) {
      if (!zaehlt(s)) continue;
      const p = proPerson[s.personId] || (proPerson[s.personId] = { anzahlProGetraenk: {}, summeProGetraenk: {}, anzahl: 0, summeCent: 0 });
      p.anzahlProGetraenk[s.getraenkId] = (p.anzahlProGetraenk[s.getraenkId] || 0) + 1;
      p.summeProGetraenk[s.getraenkId] = (p.summeProGetraenk[s.getraenkId] || 0) + s.preisCent;
      p.anzahl += 1;
      p.summeCent += s.preisCent;
      anzahlProGetraenk[s.getraenkId] = (anzahlProGetraenk[s.getraenkId] || 0) + 1;
      gesamtCent += s.preisCent;
      anzahl += 1;
    }
    const nameP = new Map((personen || []).map(p => [p.id, p.name]));
    const zeilen = Object.keys(proPerson)
      .map(id => Object.assign({ personId: id, name: nameP.has(id) ? nameP.get(id) : '?' }, proPerson[id]))
      .sort((x, y) => x.name.localeCompare(y.name, 'de'));
    const reihenfolge = new Map((getraenke || []).map(g => [g.id, g.reihenfolge || 0]));
    const getraenkIds = Object.keys(anzahlProGetraenk)
      .sort((x, y) => (reihenfolge.get(x) || 0) - (reihenfolge.get(y) || 0));
    return { proPerson, zeilen, anzahlProGetraenk, getraenkIds, gesamtCent, anzahl };
  }

  /** Preis pro Flasche aus Kistenpreis, immer aufgerundet auf rundenAufCent. Rechnet ganzzahlig. */
  function preisVorschlag(kisteCent, anzahl, rundenAufCent) {
    if (!(kisteCent > 0) || !(anzahl > 0)) return 0;
    const r = rundenAufCent > 0 ? rundenAufCent : 1;
    const teiler = anzahl * r;
    return Math.floor((kisteCent + teiler - 1) / teiler) * r;
  }

  /** Ungerundeter Preis pro Flasche als Text in Cent, z. B. "94,95 ct". */
  function formatCtUngerundet(kisteCent, anzahl) {
    if (!(anzahl > 0)) return '';
    const hundertstel = Math.round(kisteCent * 100 / anzahl);
    const ganz = Math.floor(hundertstel / 100);
    const rest = String(hundertstel % 100).padStart(2, '0');
    return ganz + ',' + rest + ' ct';
  }

  function gruppiere(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }

  /** Betrag ohne Währungszeichen, z. B. "4,80". */
  function formatZahl(cent) {
    const neg = cent < 0;
    const c = Math.abs(Math.round(cent));
    return (neg ? '-' : '') + gruppiere(Math.floor(c / 100)) + ',' + String(c % 100).padStart(2, '0');
  }

  /** Betrag in Euro, z. B. formatEuro(480) = "4,80 €". */
  function formatEuro(cent) {
    return formatZahl(cent) + ' €';
  }

  /** Liest Euro-Eingaben wie "1,20", "1.2" oder "1,20 €". Liefert ganze Cent oder null. */
  function parseEuro(text) {
    if (typeof text !== 'string') return null;
    const t = text.replace(/€/g, '').replace(/\s/g, '');
    if (!/^\d{1,6}([.,]\d{0,2})?$/.test(t)) return null;
    const [e, c = ''] = t.split(/[.,]/);
    return Number(e) * 100 + Number((c + '00').slice(0, 2));
  }

  /**
   * Abschluss bilden: ordnet alle offenen, nicht stornierten Striche im Zeitraum dem neuen Abschluss zu.
   * Gibt neue Strich-Objekte zurück, die Eingabe bleibt unverändert.
   */
  function abschliessen(striche, abschluss) {
    const kandidaten = new Set(imZeitraum(offeneStriche(striche), abschluss.von, abschluss.bis).map(s => s.id));
    const bezahlt = {};
    const neu = striche.map(s => {
      if (!kandidaten.has(s.id)) return s;
      bezahlt[s.personId] = false;
      return Object.assign({}, s, { abschlussId: abschluss.id });
    });
    return {
      striche: neu,
      geaendert: neu.filter(s => kandidaten.has(s.id)),
      abschluss: Object.assign({}, abschluss, { bezahlt }),
    };
  }

  function datumTeil(d) {
    const z = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  }

  function exportDateiname(datum) {
    return 'strich-export-' + datumTeil(datum) + '.json';
  }

  /** Exportobjekt für die JSON-Datei. */
  function exportObjekt(daten, jetztIso) {
    const d = {};
    for (const k of STORES) d[k] = Array.isArray(daten[k]) ? daten[k] : [];
    d.meta = Object.assign({}, daten.meta || {}, { schemaVersion: VERSION });
    return { format: FORMAT, version: VERSION, exportiert: jetztIso, daten: d };
  }

  /** Prüft eine eingelesene Exportdatei. Liefert { ok, fehler } oder { ok, daten, vorschau }. */
  function pruefeImport(obj) {
    if (!obj || typeof obj !== 'object' || obj.format !== FORMAT) {
      return { ok: false, fehler: 'Das ist keine Exportdatei von strich.' };
    }
    if (typeof obj.version !== 'number' || !Number.isInteger(obj.version) || obj.version < 1) {
      return { ok: false, fehler: 'Unbekannte Version der Exportdatei.' };
    }
    if (obj.version > VERSION) {
      return { ok: false, fehler: 'Die Datei stammt aus einer neueren Version von strich (Version ' + obj.version + '). Bitte aktualisiere die App.' };
    }
    const d = obj.daten;
    if (!d || typeof d !== 'object') return { ok: false, fehler: 'Die Datei enthält keine Daten.' };
    for (const k of STORES) {
      if (!Array.isArray(d[k])) return { ok: false, fehler: 'In der Datei fehlt der Bereich "' + k + '".' };
    }
    for (const s of d.striche) {
      if (!Number.isInteger(s.preisCent)) return { ok: false, fehler: 'Ein Strich hat keinen gültigen Preis.' };
    }
    const daten = {};
    for (const k of STORES) daten[k] = d[k];
    daten.meta = Object.assign({}, d.meta || {}, { schemaVersion: VERSION });
    return {
      ok: true,
      daten,
      vorschau: { personen: d.personen.length, getraenke: d.getraenke.length, striche: d.striche.length },
    };
  }

  function csvFeld(t) {
    const s = String(t);
    return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  /** CSV einer Abrechnung: person;getraenk;anzahl;summe_euro, Semikolon, Dezimalkomma, UTF-8 mit BOM. */
  function abrechnungCsv(erg, getraenke) {
    const nameG = new Map((getraenke || []).map(g => [g.id, g.name]));
    const zeilen = ['person;getraenk;anzahl;summe_euro'];
    for (const z of erg.zeilen) {
      for (const gid of erg.getraenkIds) {
        const n = z.anzahlProGetraenk[gid];
        if (!n) continue;
        zeilen.push([csvFeld(z.name), csvFeld(nameG.get(gid) || '?'), n, formatZahl(z.summeProGetraenk[gid])].join(';'));
      }
    }
    zeilen.push(['gesamt', '', erg.anzahl, formatZahl(erg.gesamtCent)].join(';'));
    return '﻿' + zeilen.join('\r\n') + '\r\n';
  }

  /** Erfundene Demodaten, alle mit beispiel: true. */
  function demoDaten(jetzt, neueId) {
    const ms = jetzt.getTime();
    const iso = d => new Date(ms - d).toISOString();
    const personen = ['Anna', 'Ben', 'Carla', 'Deniz'].map((name, i) => ({
      id: neueId(), name, archiviert: false, beispiel: true, erstellt: iso(9e6 - i),
    }));
    const getraenke = [['Wasser', 80], ['Bier', 120], ['Mate', 150], ['Kaffee', 50]].map(([name, preisCent], i) => ({
      id: neueId(), name, preisCent, archiviert: false, beispiel: true, reihenfolge: i,
    }));
    const muster = [[0, 0], [0, 0], [0, 1], [1, 2], [1, 3], [1, 3], [2, 1], [2, 1], [3, 0], [3, 2], [0, 3]];
    const striche = muster.map(([p, g], i) => ({
      id: neueId(), personId: personen[p].id, getraenkId: getraenke[g].id, preisCent: getraenke[g].preisCent,
      zeit: iso((muster.length - i) * 37 * 60000), storniert: false, abschlussId: null, beispiel: true,
    }));
    return { personen, getraenke, striche };
  }

  /**
   * Entfernt nur Beispieldaten: Striche mit beispiel: true, Beispiel-Personen und -Getränke.
   * Hängen an einer Beispiel-Person oder einem Beispiel-Getränk eigene Striche, bleibt sie
   * erhalten und gilt ab dann als eigene (beispiel: false). Abschlüsse, die nur Beispielstriche
   * hatten, fallen weg; alle anderen bleiben.
   */
  function ohneBeispiel(daten) {
    const striche = daten.striche.filter(s => s.beispiel !== true);
    const genutzt = new Set();
    for (const s of striche) { genutzt.add(s.personId); genutzt.add(s.getraenkId); }
    const raus = new Set();
    const behalten = liste => liste
      .filter(x => (x.beispiel && !genutzt.has(x.id) ? (raus.add(x.id), false) : true))
      .map(x => (x.beispiel ? Object.assign({}, x, { beispiel: false }) : x));
    const personen = behalten(daten.personen);
    const getraenke = behalten(daten.getraenke);
    const vorher = new Set(daten.striche.map(s => s.abschlussId).filter(Boolean));
    const nachher = new Set(striche.map(s => s.abschlussId).filter(Boolean));
    const abschluesse = daten.abschluesse.filter(a => nachher.has(a.id) || !vorher.has(a.id)).map(a => {
      const bezahlt = {};
      for (const k of Object.keys(a.bezahlt || {})) if (!raus.has(k)) bezahlt[k] = a.bezahlt[k];
      return Object.assign({}, a, { bezahlt });
    });
    return Object.assign({}, daten, { personen, getraenke, striche, abschluesse });
  }

  return {
    FORMAT, VERSION, STORES,
    summePerson, offeneStriche, imZeitraum, abrechnung,
    preisVorschlag, formatCtUngerundet, formatEuro, formatZahl, parseEuro,
    abschliessen, exportObjekt, exportDateiname, pruefeImport, abrechnungCsv,
    demoDaten, ohneBeispiel, datumTeil,
  };
});
