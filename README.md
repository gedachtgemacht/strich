# strich.

**Tap a tally mark, settle up fairly at the end of the month.** strich. is the drinks tally sheet for shared flats, clubs and offices.

It replaces the paper tally list on the fridge: an old tablet or phone runs the app, people tap their name and their drink, and strich. adds up who owes what. It is an offline PWA with no account and no server, and the data stays on the device.

![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue) ![PWA](https://img.shields.io/badge/PWA-installable-5a4fcf) ![Offline](https://img.shields.io/badge/offline-yes-2e7d32) ![No dependencies](https://img.shields.io/badge/dependencies-none-lightgrey)

The app interface is in German.

The paper list on the fridge gets unreadable, gets lost and has to be added up by hand at the end of the month. Paid apps want a subscription, an account or internet, open-source ones need their own server. strich. runs on an old tablet or phone by the fridge: tap the person, tap the drink, done. The app does the totals.

Plain arithmetic in whole cents, no AI, no server. Everything stays on your device.

<p align="center">
  <img src="bilder/1-uebersicht.png" width="240" alt="Phone view of the empty start screen with buttons to add a person, load the example or open an invitation">
</p>
<p align="center">
  <img src="bilder/2-breit.png" width="640" alt="Desktop view of the same start screen with the navigation at the top">
</p>

## Why

There are tally apps that can count and settle up, for example Strichliste: Getränke Zähler, Getränkewart 2.0 or bierliste.at. They cost money, some require an account and internet, and none of them is open source, offline and account-free at the same time. strich. is exactly that: one tool, one job.

## Features

- **People:** add, rename and archive. Archived people no longer show up when tapping marks, but stay in the settlement while they still have open marks
- **Drinks** with name and price in euros; the price can be changed at any time, the order is adjustable
- **Price suggestion from the crate:** enter the crate price and bottle count, strich. rounds the price per bottle up to 5 or 10 cents and shows the unrounded value next to it
- **Add a mark:** tap the person, tap the drink. For ten seconds afterwards you can tap "rückgängig" ("undo")
- **History per person** with cancellation of single marks
- **Settlement** for all open marks or a chosen period: total per person and overall, expandable by drink
- **Close out:** the open marks then belong to this closing, and each person can be ticked off as "bezahlt" ("paid")
- **Export** of the settlement as CSV for German Excel (semicolon, decimal comma)
- **Several phones on the same evening:** share an invitation link; the others open it and get the same people, drinks and open marks. Each phone adds its own marks, and before settling up everyone sends their link back. strich. merges without duplicates, cancellations travel along
- **Backup** of all data as a JSON file, import on another device with a preview before replacing
- **Sample data** (made-up people and drinks, marked as `beispiel` ("example")), removable with one click after a confirmation. Your own marks are kept, even if they are on a sample drink or a sample person
- Light and dark mode, works offline, installable as an app

## Privacy

Nothing leaves your device. strich. has no server, no account, no analytics, no ads and loads nothing from the network. People, drinks and marks are stored only in your browser's local database (IndexedDB). Exports and backups are only created when you trigger them yourself.

The invitation link carries the open state itself, packed behind the `#` of the address. This part is not sent to the server strich. is hosted on when the link is opened. But you send the link yourself, for example via a messenger, and anyone who has it can see names and marks. So only send it to the group.

Because the data lives only in the browser: if you clear the site data or lose the device, you lose the list too. Make a backup now and then. strich. asks the browser for persistent storage and shows you the date of the last backup.

Limits, deliberately the same as with the paper list:

- Anyone at the device can add marks for anyone. There is no PIN and no per-person permissions
- No live sync: the phones only sync when someone opens a link. A server that constantly distributes everything would contradict the principle that everything stays on the device
- No personal account per person; the link is not an access with permissions
- Settling up happens on one phone. The others keep showing their old open totals afterwards; a closed state does not travel along
- If strich. is installed as an app on an iPhone, tapping a link opens the browser, not the app. Copy the link and paste it in the app under "mehrere handys" ("several phones")
- For moving to a new device there is export and import
- No stock management, no online payment, no bank connection

## Install

strich. is a static web app. There is no build step and there are no dependencies.

1. Put the `strich/` folder on any static host (your own web space, GitHub Pages, Netlify, a Raspberry Pi). Installing it as an app needs HTTPS.
2. Open the address in the browser of the tablet or phone.
3. In the browser menu choose **Zum Startbildschirm hinzufügen** ("Add to Home Screen"). After that strich. starts like an app and also works without a network.

Test locally:

```
cd strich
python3 -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

## How the math works

**1. Marks in cents.** Each mark stores the price that applied when it was added. A later price change does not change old marks. All amounts are whole cents; there is no estimate and therefore no range.

**2. Total per person.** Sum of the prices of all marks that are not cancelled. Cancelled marks do not count.
Example: 3 × water at 80 ct and 2 × beer at 120 ct give 240 + 240 = 480 ct = €4.80.

**3. Price change and cancellation.** Two beers at 120 ct, then the price goes to 150 ct, then two beers at 150 ct, one of them cancelled: 2 × 120 + 1 × 150 = 390 ct = €3.90. Together with the example above: 870 ct = €8.70.

**4. Settlement.** Count and total per person and drink, plus the grand total. When closing out, only open, non-cancelled marks within the chosen period are assigned to the closing.

**5. Price suggestion.** Price per bottle = crate price ÷ count, rounded up to 5 or 10 cents so the cash box does not go negative. This is the only rounded value, and the app shows the unrounded one next to it.
Example: crate €18.99, 20 bottles: 94.95 ct per bottle, rounded to 5 ct gives 95 ct, rounded to 10 ct gives 100 ct.

**6. Several phones.** Each mark has a random ID. When merging, only marks, people and drinks whose ID the phone does not know yet are added. A cancellation travels along as long as the mark is still open, and is never reversed. Known people and drinks keep their state on the phone. Opening the same link twice changes nothing.
Example: phone 1 has 1 beer (120 ct) for Anna and invites phone 2. Then phone 2 adds 2 waters for Ben and 1 water for Anna (80 ct each), phone 1 adds 1 beer for Ben. Phone 2 sends its link back: Anna 120 + 80 = 200 ct, Ben 120 + 160 = 280 ct, total 480 ct. If phone 2 then cancels one of Ben's waters and sends again, it is 400 ct, and after the link from phone 1, phone 2 also shows 400 ct.

The calculations are pure functions in `src/rechnen.js` and `src/abgleich.js` and are tested with `node test-calc.js` against these hand calculations.

## License

GNU Affero General Public License v3.0 (AGPL-3.0), see `LICENSE`.

**Deutsch:** strich. ist eine digitale Strichliste und Getränkeliste für WG, Verein und Büro, mit Getränkekasse-Abrechnung pro Person und CSV-Export, offline und ohne Konto.

---

**gedacht.gemacht.** Small, honest software. Everything stays on your device. · [More projects](https://github.com/gedachtgemacht)
