# Browsertest für den Abgleich per Link mit zwei getrennten Browser-Kontexten (zwei Handys).
# Aufruf: python3 test-zwei-handys.py .   (braucht Python-Playwright mit Chromium)
import http.server, threading, functools, sys, os
from playwright.sync_api import sync_playwright

ordner = sys.argv[1]
class Leise(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

H = functools.partial(Leise, directory=ordner)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
url = 'http://127.0.0.1:%d/index.html' % srv.server_port

def summe(page):
    return page.inner_text('#gesamt')

with sync_playwright() as p:
    b = p.chromium.launch()
    h1 = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    h2 = b.new_context(viewport={'width': 390, 'height': 844}).new_page()
    fehler = []
    for h in (h1, h2):
        h.on('pageerror', lambda e: fehler.append(str(e)))
    h1.goto(url)
    h1.click('text=beispiel laden')
    h1.wait_for_selector('.kachel')
    h1.goto(url + '#abrechnung')
    s1 = summe(h1)
    h1.goto(url + '#teilen')
    h1.click('text=link kopieren')
    h1.wait_for_selector('#meinLink')
    link = h1.input_value('#meinLink')
    print('linklaenge', len(link))
    h2.goto(link)
    h2.wait_for_selector('#uebernehmen')
    print('h2 adresse nach oeffnen endet auf', h2.url[-12:])
    h2.screenshot(path=os.path.join(ordner, 'bilder', 'pruef-eingang.png'), full_page=True)
    h2.click('#uebernehmen')
    h2.wait_for_selector('.kachel')
    h2.goto(url + '#abrechnung')
    print('summe h1', s1, 'h2', summe(h2))
    assert s1 == summe(h2)
    h2.goto(url + '#liste')
    h2.click('.kachel >> nth=0')
    h2.click('.gk >> nth=1')
    h2.goto(url + '#abrechnung')
    s2 = summe(h2)
    h2.goto(url + '#teilen')
    h2.click('text=link kopieren')
    h2.wait_for_selector('#meinLink')
    link2 = h2.input_value('#meinLink')
    h1.goto(url + '#teilen')
    h1.fill('#fremderLink', link2)
    h1.click('text=link prüfen')
    h1.wait_for_selector('#uebernehmen')
    print('vorschau', h1.inner_text('#eingang'))
    h1.click('#uebernehmen')
    h1.wait_for_selector('.kachel')
    h1.goto(url + '#abrechnung')
    print('nach rueckweg h1', summe(h1), 'h2', s2)
    assert summe(h1) == s2 and s2 != s1
    h1.goto(link2)
    h1.wait_for_selector('#eingang')
    print('nochmal', h1.inner_text('#eingang'))
    assert 'schon auf diesem gerät' in h1.inner_text('#eingang')
    h1.goto(url + '#teilen')
    h1.fill('#fremderLink', 'kaputt')
    h1.click('text=link prüfen')
    h1.wait_for_selector('.hinweis.warn')
    print('kaputt', h1.inner_text('.hinweis.warn'))
    h1.screenshot(path=os.path.join(ordner, 'bilder', 'pruef-teilen.png'), full_page=True)
    assert 'kein Link von strich' in h1.inner_text('.hinweis.warn')
    breite = h1.evaluate('document.documentElement.scrollWidth')
    print('scrollbreite', breite)
    assert breite <= 390
    print('seitenfehler', fehler)
    assert not fehler
    print('ok')
    b.close()
srv.shutdown()
