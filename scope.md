# strich.

Getränke-Strichliste für WG, Verein und Büro: Striche setzen, am Monatsende fair abrechnen.

## Problem

Getränkekassen in WG, Verein und Büro laufen über Papierlisten am Kühlschrank oder über Apps. Papier wird unleserlich, geht verloren und muss am Monatsende von Hand zusammengezählt werden. Die Apps kosten Geld oder ein Abo, brauchen meist ein Konto und Internet, und die offenen Lösungen setzen einen eigenen Server voraus. Wer einfach ein altes Tablet oder Handy an den Kühlschrank legen will, findet nichts Schlichtes, das offline läuft und nichts nach außen schickt.

## Zielgruppe

- WGs mit gemeinsamer Getränkekiste
- kleine Vereine und Teams mit einer Getränkekasse, um die sich eine Person kümmert
- Büros mit Kühlschrank und Kaffee

Ein gemeinsames Gerät (Tablet oder Handy am Kühlschrank) ist der Normalfall. Für Abende mit mehreren Handys (Feier, Vereinsabend) gibt es den Abgleich per Link, ohne Server und ohne Live-Abgleich.

## Bezahltes Vorbild

- **Strichliste: Getränke Zähler** (iOS): Personen und Getränke anlegen, Striche zählen, Summen anzeigen. Kostenpflichtige Funktionen per In-App-Kauf, Preis im App Store prüfen.
- **Getränkewart 2.0** (iOS): Strichliste mit Abrechnung, kostenpflichtig.
- **bierliste.at**: Web-Strichliste mit Konto und Internetpflicht, kostenpflichtig für Vereine.

Alle können zählen und abrechnen. Keins davon ist offen, offline und ohne Konto zugleich.

## Funktionen v1

1. Personen anlegen, umbenennen, archivieren (archivierte tauchen beim Strichesetzen nicht mehr auf, bleiben in alten Abrechnungen).
2. Getränke anlegen mit Name und Preis in Euro, Preis jederzeit änderbar. Optionaler Helfer: Preis pro Flasche aus Kistenpreis und Anzahl, aufgerundet auf 5 oder 10 Cent.
3. Strich setzen: Person antippen, Getränk antippen, fertig. Danach 10 Sekunden lang "rückgängig".
4. Verlauf pro Person mit Möglichkeit, einzelne Striche zu stornieren.
5. Abrechnung: Zeitraum wählen (Standard: alle offenen Striche), Summe pro Person und gesamt, Anzahl pro Getränk. Abrechnung abschließen: offene Striche werden diesem Abschluss zugeordnet, danach pro Person "bezahlt" abhaken.
6. Export und Import der gesamten Daten als JSON-Datei, Export einer Abrechnung als CSV.
7. Demodaten (erfundene Personen und Getränke, als `Beispiel` markiert, mit einem Klick entfernbar).
8. Installierbare PWA, hell und dunkel.
9. **Mehrere Handys per Einladungslink** (Wunsch des Betreibers nach dem ersten Test): Ein Handy teilt einen Link, der Personen, Getränke und alle offenen Striche gepackt hinter dem `#` trägt. Wer ihn öffnet, sieht eine Vorschau (was ist neu, welche Namen gibt es schon) und tippt auf "übernehmen". Jedes Handy setzt dann eigene Striche. Vor dem Abrechnen schicken alle ihren Link an ein Handy zurück. Zusammenführen ist idempotent, Stornos wandern mit. Für installierte Apps, bei denen der Link im Browser aufgeht, gibt es ein Feld zum Einfügen.

## Nicht-Ziele

- Kein Live-Abgleich, kein Server, kein Konto. Abgleich nur, wenn jemand einen Link öffnet
- Abgeschlossene Abrechnungen wandern nicht per Link mit (v1)
- Keine Bestandsverwaltung oder Einkaufsliste
- Keine Online-Bezahlung, keine Bankanbindung, keine Erinnerungs-Mails
- Keine PIN oder Rechteverwaltung pro Person (Vertrauensbasis wie bei der Papierliste)
- Keine Statistiken über die Abrechnung hinaus, keine Ranglisten

## Datenmodell

Speicher: **IndexedDB**, Datenbank `strich`, Schema-Version `1`. Beträge immer als ganze Cent (Integer), Zeiten als ISO-String.

- `personen`: `id`, `name`, `archiviert` (bool), `beispiel` (bool), `erstellt`
- `getraenke`: `id`, `name`, `preisCent`, `archiviert`, `beispiel`, `reihenfolge`
- `striche`: `id`, `personId`, `getraenkId`, `preisCent` (Preis zum Zeitpunkt des Strichs, eingefroren), `zeit`, `storniert` (bool), `abschlussId` (null = offen)
- `abschluesse`: `id`, `von`, `bis`, `erstellt`, `bezahlt` (Map `personId` auf bool)
- `meta`: `schemaVersion`, `demoGeladen`

Migrationen laufen in `onupgradeneeded` schrittweise je Version.

Export: Datei `strich-export-JJJJ-MM-TT.json` mit `{ "format": "strich", "version": 1, "exportiert": ISO, "daten": {...alle Stores} }`. Import prüft `format` und `version`, zeigt eine Vorschau (Anzahl Personen, Getränke, Striche) und ersetzt nach Bestätigung alle Daten. Unbekannte oder neuere Versionen werden mit klarer Meldung abgelehnt. CSV der Abrechnung: `person;getraenk;anzahl;summe_euro`, Semikolon, Dezimalkomma, UTF-8 mit BOM.

Abgleich-Link (`src/abgleich.js`): Adresse der App plus `#abgleich/` plus Code. Erstes Zeichen des Codes `z` (JSON, gepackt mit `deflate-raw` über die eingebaute `CompressionStream`, dann base64url) oder `j` (JSON ungepackt, base64url, Rückfall für Browser ohne Kompression). JSON: `{ "f": "strich-abgleich", "v": 1, "t": ISO, "p": [[id, name, archiviert 0/1, beispiel 0/1]], "g": [[id, name, preisCent, archiviert, beispiel]], "s": [[id, personIndex, getraenkIndex, preisCent, zeitMs, storniert 0/1, beispiel 0/1]] }`. Im Paket: alle offenen Striche (auch stornierte), alle nicht archivierten Personen und Getränke und die archivierten, auf die ein offener Strich zeigt; `g` in der Reihenfolge der App. Neuere Versionen, fremde oder abgeschnittene Links werden mit klarer Meldung abgelehnt. Die App nimmt den Code nach dem Lesen aus der Adresse (`#teilen`), damit er nicht im Verlauf stehen bleibt.

## Rechenlogik

Reine Funktionen in `src/rechnen.js`, ohne DOM und ohne Speicherzugriff:

- `summePerson(striche, personId)` = Σ `preisCent` aller nicht stornierten Striche der Person
- `abrechnung(striche, personen, getraenke)` liefert pro Person `{ anzahlProGetraenk, summeCent }` und `gesamtCent`
- `preisVorschlag(kisteCent, anzahl, rundenAufCent)` = `ceil(kisteCent / anzahl / rundenAufCent) * rundenAufCent`
- `formatEuro(cent)` liefert `4,80 €`

Der Preis wird beim Strich eingefroren, damit spätere Preisänderungen alte Striche nicht verändern. Alle Beträge sind exakt in Cent, es gibt keine Schätzung und damit keine Spanne. Der einzige gerundete Wert ist der Preisvorschlag, und der rundet immer auf, damit die Kasse nicht ins Minus läuft; die App zeigt dazu den ungerundeten Wert an ("94,95 ct pro Flasche, vorgeschlagen 0,95 €").

Handrechnungen (Testfälle):

1. **Einfache Summe:** Person A hat 3× Wasser zu 80 ct und 2× Bier zu 120 ct. 3 × 80 + 2 × 120 = 240 + 240 = **480 ct = 4,80 €**.
2. **Preisänderung und Storno:** Person B nimmt 2× Bier zu 120 ct, dann wird der Preis auf 150 ct erhöht, danach 2× Bier zu 150 ct, davon wird einer storniert. 2 × 120 + 1 × 150 = **390 ct = 3,90 €**. Gesamt mit Person A aus Beispiel 1: 480 + 390 = **870 ct = 8,70 €**.
3. **Preisvorschlag:** Kiste 18,99 €, 20 Flaschen. 1899 / 20 = 94,95 ct. Auf 5 ct: ceil(18,99) × 5 = **95 ct**. Auf 10 ct: ceil(9,495) × 10 = **100 ct**.
4. **Zwei Handys:** Wasser 80 ct, Bier 120 ct. Handy 1 hat Anna 1 Bier und lädt Handy 2 ein (Handy 2 zeigt 120 ct). Dann Handy 2: Ben 2 Wasser, Anna 1 Wasser; Handy 1: Ben 1 Bier. Handy 2 schickt seinen Link an Handy 1: 3 neue Striche, Anna 120 + 80 = **200 ct**, Ben 120 + 2 × 80 = **280 ct**, gesamt **480 ct**. Derselbe Link noch einmal: keine Änderung. Handy 2 storniert ein Wasser von Ben und schickt erneut: 1 Storno, Ben **200 ct**, gesamt **400 ct**. Handy 1 schickt seinen Link an Handy 2: auch dort **400 ct**.

Regeln für `zusammenfuehren(lokal, paket)`: Kennung entscheidet, nicht der Name. Unbekannte Personen, Getränke und Striche kommen dazu, neue Getränke hinten in der Reihenfolge. Bekannte Personen und Getränke behalten ihren lokalen Stand. Ein Storno wird übernommen, wenn der Strich lokal noch offen ist, und nie zurückgenommen. Abgerechnete Striche bleiben unberührt. Neue Einträge mit einem Namen, den es lokal schon gibt, werden in der Vorschau gemeldet.

## Screens

Handy zuerst, große Tippflächen (mindestens 48 px), ab 1280 px zweispaltig.

1. **Liste** (Start): Raster mit Personen-Kacheln, jede zeigt Name und offene Summe in `--mono`. Tippen öffnet ein Blatt mit den Getränken als große Knöpfe; ein Tipp setzt den Strich, Toast mit "rückgängig". Am Desktop: Personen links, Getränke rechts.
2. **Person**: offene Striche als Verlauf (Zeit, Getränk, Preis), Storno pro Eintrag, offene Summe, Umbenennen, Archivieren.
3. **Abrechnung**: Zeitraum, Tabelle Person × Summe, aufklappbar nach Getränk, Gesamtsumme. Knöpfe "abschließen" und "csv exportieren". Liste früherer Abschlüsse mit Bezahlt-Häkchen pro Person.
4. **Einstellungen**: Personen und Getränke verwalten (Preis, Reihenfolge, Preisvorschlag aus Kiste), Demodaten laden oder entfernen, Export, Import, Hinweis "Alles bleibt auf deinem Gerät".

5. **Mehrere Handys** (`#teilen`, erreichbar über "mehrere handys" auf der Liste und in den Einstellungen): Anleitung in vier Schritten, Knöpfe "link teilen" (Teilen-Menü des Systems, sonst Zwischenablage) und "link kopieren", Feld mit dem Link; darunter "Link öffnen" mit Einfügefeld und Vorschau mit "übernehmen" und "verwerfen". Kommt ein Link an, steht die Vorschau oben.

Leerer Zustand auf der Liste: kurzer Text plus Knöpfe "person anlegen", "beispiel laden" und "einladung öffnen".

## Testplan

- **Funktionstests** (Node, ohne Browser) für `rechnen.js`: die drei Handrechnungen exakt, dazu leere Liste ergibt 0, nur stornierte Striche ergeben 0, archivierte Person mit offenen Strichen bleibt in der Abrechnung, `formatEuro(5)` ergibt `0,05 €`.
- **Datentests:** Export und Re-Import ergeben identische Daten; Import mit falschem `format` oder höherer `version` wird abgelehnt; Abschluss ordnet nur offene, nicht stornierte Striche zu.
- **Playwright bei 390 px und 1280 px:** Person und Getränk anlegen, drei Striche setzen, einen rückgängig machen, Summe stimmt; Preis ändern, alter Strich behält alten Preis; Abrechnung abschließen, Liste zeigt danach 0,00 €; Demodaten laden und mit einem Klick entfernen; Hell- und Dunkelmodus ohne Überlauf.
- **Abgleichtests** (Node): Handrechnung 4 exakt, Storno wird nie zurückgenommen, abgerechnete Striche bleiben unberührt, gleiche Namen werden gemeldet, Paketinhalt, Testvektor für einen ungepackten Code, gepackter Code hin und zurück mit Umlauten, kaputte, fremde, abgeschnittene und neuere Links werden abgelehnt.
- **Playwright mit zwei Browser-Kontexten bei 390 px:** Handy 1 lädt Beispiel und kopiert den Link, Handy 2 öffnet ihn und übernimmt (gleiche Gesamtsumme), Handy 2 setzt einen Strich und schickt den Link zurück, Handy 1 fügt ihn ein (1 neuer Strich, Summen gleich), derselbe Link erneut zeigt "schon auf diesem gerät".
- **Offline-Test:** Seite laden, Netz in Playwright trennen, neu laden, Strich setzen und Abrechnung öffnen funktioniert; Daten nach Neuladen noch da.
- **Keine externen Requests:** Playwright protokolliert alle Requests; jeder Request außerhalb des eigenen Origins lässt den Test scheitern.
- Textprüfung: keine Gedankenstriche in UI-Texten und README.

## Risiken

- **Datenverlust:** Gerät weg oder Browserdaten gelöscht bedeutet Liste weg. Gegenmittel: Export gut sichtbar, Hinweis mit Datum des letzten Exports, `navigator.storage.persist()` anfragen.
- **Fehltipps am geteilten Gerät:** Falsche Person oder falsches Getränk. Gegenmittel: Rückgängig-Toast und Storno im Verlauf, Bestätigung zeigt Name und Getränk.
- **Missbrauch:** Jeder kann bei jedem Striche setzen. Bewusst wie Papier gelöst, im README benannt.
- **Mehrere Geräte:** Gelöst über Links statt Server. Grenzen: kein Live-Abgleich; wer vergisst, seinen Link zurückzuschicken, fehlt in der Abrechnung; ein Strich, der geteilt und danach mit "rückgängig" gelöscht wurde, kommt über einen alten Link zurück (Storno im Verlauf ist der sichere Weg); nach dem Abschließen zeigen die anderen Handys weiter ihre alten Summen. Lange Abende ergeben lange Links (grob 30 bis 40 Zeichen pro Strich, weil die zufälligen Kennungen sich kaum packen lassen).
- **Link ist Klartext für alle, die ihn haben:** Namen und Striche stehen gepackt, aber unverschlüsselt im Link. Hinweis direkt am Teilen-Knopf.
- **iPhone mit installierter App:** Links öffnen im Browser, der einen eigenen Speicher hat. Gegenmittel: Einfügefeld in der App und Hinweis dazu.
- **Namensnähe** zum Projekt strichliste: Name `strich.` ist eigenständig genug, im README kein Bezug darauf nötig.
