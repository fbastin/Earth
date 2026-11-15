"""Pilote un Chrome sans interface par le protocole DevTools, sans rien installer d'autre que Python.

Chrome est lancé avec --remote-debugging-pipe : les messages passent par deux tubes (descripteurs 3 et 4 du
navigateur), chacun terminé par un octet nul. Le site est servi par tools/serve.py, dans ce même processus.

Le navigateur est cherché dans la variable CHROME, puis dans le cache de Playwright, puis parmi les noms courants
(chrome-headless-shell, chromium, google-chrome…). Sans navigateur, trouver() renvoie None et les tests de la page
sont sautés.
"""
import fcntl, glob, json, os, queue, shutil, subprocess, sys, tempfile, threading, time
from http.server import ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import serve  # noqa: E402

NOMS = ["chrome-headless-shell", "chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"]


def trouver():
    """Chemin d'un Chrome utilisable, ou None."""
    c = os.environ.get("CHROME")
    if c:
        return c if os.path.exists(c) else shutil.which(c)
    cache = os.path.expanduser("~/.cache/ms-playwright")
    for motif in ("chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell", "chromium-*/chrome-linux*/chrome"):
        vus = sorted(glob.glob(os.path.join(cache, motif)))
        if vus:
            return vus[-1]
    for n in NOMS:
        p = shutil.which(n)
        if p:
            return p
    return None


class _Httpd(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        if not isinstance(sys.exc_info()[1], ConnectionError):      # une page fermée en plein chargement : sans intérêt
            super().handle_error(request, client_address)


class Serveur:
    """Le site, servi sur un port libre de la machine."""

    def __init__(self):
        self.httpd = _Httpd(("127.0.0.1", 0), serve.Handler)
        self.url = "http://127.0.0.1:%d/" % self.httpd.server_address[1]
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def fermer(self):
        self.httpd.shutdown()
        self.httpd.server_close()


class Erreur(Exception):
    pass


class Chrome:
    def __init__(self, chemin, options=()):
        self.profil = tempfile.mkdtemp(prefix="terre-tests-")
        # Deux tubes ; les bouts du navigateur sont d'abord placés au-dessus de 10, puis ramenés en 3 et 4 dans le processus fils.
        r_nav, w_moi = os.pipe()
        r_moi, w_nav = os.pipe()
        hauts = [fcntl.fcntl(fd, fcntl.F_DUPFD, 10) for fd in (r_nav, w_nav)]
        os.close(r_nav), os.close(w_nav)
        args = [chemin, "--headless", "--remote-debugging-pipe", "--no-sandbox", "--enable-unsafe-swiftshader",
                "--no-first-run", "--disable-background-networking", "--user-data-dir=" + self.profil,
                "--window-size=1280,900", "--lang=fr"] + list(options)

        def tubes():
            os.dup2(hauts[0], 3)
            os.dup2(hauts[1], 4)

        self.proc = subprocess.Popen(args, preexec_fn=tubes, pass_fds=(3, 4),
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for fd in hauts:
            os.close(fd)
        self.sortie = os.fdopen(w_moi, "wb", buffering=0)
        self.entree = os.fdopen(r_moi, "rb", buffering=0)
        self.n = 0
        self.reponses = {}
        self.pages = {}                     # sessionId -> Page
        self.cv = threading.Condition()
        threading.Thread(target=self._lire, daemon=True).start()

    def _lire(self):
        reste = b""
        while True:
            try:
                bloc = self.entree.read(65536)
            except OSError:
                bloc = b""
            if not bloc:
                with self.cv:
                    self.reponses[None] = "fermé"
                    self.cv.notify_all()
                return
            reste += bloc
            *msgs, reste = reste.split(b"\0")
            for m in msgs:
                d = json.loads(m)
                with self.cv:
                    if "id" in d:
                        self.reponses[d["id"]] = d
                        self.cv.notify_all()
                    else:
                        p = self.pages.get(d.get("sessionId"))
                        if p:
                            p.evenements.put(d)

    def envoyer(self, methode, params=None, session=None, delai=60):
        with self.cv:
            self.n += 1
            n = self.n
            msg = {"id": n, "method": methode, "params": params or {}}
            if session:
                msg["sessionId"] = session
            self.sortie.write(json.dumps(msg).encode("utf-8") + b"\0")
            fin = time.time() + delai
            while n not in self.reponses:
                if None in self.reponses:
                    raise Erreur("le navigateur s'est arrêté")
                if not self.cv.wait(max(0, fin - time.time())) and time.time() >= fin:
                    raise Erreur("pas de réponse à " + methode)
            d = self.reponses.pop(n)
        if "error" in d:
            raise Erreur("%s : %s" % (methode, d["error"].get("message")))
        return d.get("result", {})

    def page(self, largeur=1280, hauteur=900, tactile=False):
        """Une page neuve, dans un profil vierge (rien de mémorisé par une page précédente)."""
        ctx = self.envoyer("Target.createBrowserContext")["browserContextId"]
        cible = self.envoyer("Target.createTarget", {"url": "about:blank", "browserContextId": ctx})["targetId"]
        session = self.envoyer("Target.attachToTarget", {"targetId": cible, "flatten": True})["sessionId"]
        p = Page(self, session, ctx)
        self.pages[session] = p
        for domaine in ("Runtime", "Page", "Network"):
            p.envoyer(domaine + ".enable")
        p.envoyer("Emulation.setDeviceMetricsOverride",
                  {"width": largeur, "height": hauteur, "deviceScaleFactor": 1, "mobile": tactile})
        if tactile:
            p.envoyer("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 2})
        p.bloquer()
        return p

    def fermer(self):
        try:
            self.envoyer("Browser.close", delai=5)
        except Exception:
            pass
        try:
            self.proc.wait(timeout=5)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profil, ignore_errors=True)


class Page:
    # Jamais joint pendant les tests : la page y cherche des données plus récentes, ce qui dépendrait du réseau.
    DEHORS = ["*raw.githubusercontent.com*"]

    def __init__(self, chrome, session, ctx):
        self.chrome, self.session, self.ctx = chrome, session, ctx
        self.evenements = queue.Queue()
        self.bloquees = []

    def envoyer(self, methode, params=None):
        return self.chrome.envoyer(methode, params, self.session)

    def bloquer(self, *motifs):
        """Fait échouer les requêtes dont l'adresse correspond à un des motifs (aucun : tout est rétabli)."""
        self.bloquees = list(motifs)
        self.envoyer("Network.setBlockedURLs", {"urls": self.DEHORS + self.bloquees})

    def ouvrir(self, url):
        self.envoyer("Page.navigate", {"url": url})

    def recharger(self):
        self.envoyer("Page.reload")
        time.sleep(0.3)

    def js(self, expression):
        """Valeur d'une expression JavaScript (une promesse est attendue)."""
        r = self.envoyer("Runtime.evaluate", {"expression": expression, "awaitPromise": True, "returnByValue": True})
        if "exceptionDetails" in r:
            e = r["exceptionDetails"]
            raise Erreur("JavaScript : %s" % (e.get("exception", {}).get("description") or e.get("text")))
        return r["result"].get("value")

    def attendre(self, expression, delai=30, quoi=None):
        """Attend que l'expression soit vraie ; échoue passé le délai."""
        fin = time.time() + delai
        while True:
            try:
                v = self.js(expression)
            except Erreur:
                v = None                    # page en cours de chargement
            if v:
                return v
            if time.time() > fin:
                raise AssertionError("toujours faux après %d s : %s" % (delai, quoi or expression))
            time.sleep(0.2)

    def saisir(self, ident, texte):
        self.js("(function(){var e=document.getElementById(%s); e.focus(); e.value=%s;"
                " e.dispatchEvent(new Event('input',{bubbles:true}));})()" % (json.dumps(ident), json.dumps(texte)))

    def regler(self, ident, valeur, evenement="input"):
        self.js("(function(){var e=document.getElementById(%s); e.value=%s;"
                " e.dispatchEvent(new Event(%s,{bubbles:true}));})()" % (json.dumps(ident), json.dumps(valeur), json.dumps(evenement)))

    def cliquer(self, selecteur):
        self.js("document.querySelector(%s).click()" % json.dumps(selecteur))

    def clic_souris(self, selecteur):
        """Un vrai clic de souris au milieu de l'élément (cliquer() ressemble, pour la page, à une frappe au clavier)."""
        r = json.loads(self.js("(function(){var r=document.querySelector(%s).getBoundingClientRect();"
                               "return JSON.stringify([r.left+r.width/2,r.top+r.height/2])})()" % json.dumps(selecteur)))
        for t in ("mousePressed", "mouseReleased"):
            self.envoyer("Input.dispatchMouseEvent", {"type": t, "x": r[0], "y": r[1], "button": "left", "clickCount": 1})

    def toucher(self, x, y):
        self.envoyer("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
        time.sleep(0.06)
        self.envoyer("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})

    TOUCHES = {"Enter": (13, "\r"), "Tab": (9, ""), "Escape": (27, ""), "ArrowLeft": (37, ""), "ArrowUp": (38, ""),
               "ArrowRight": (39, ""), "ArrowDown": (40, ""), " ": (32, " ")}

    def touche(self, nom):
        """Une vraie frappe au clavier, sur l'élément qui a le focus."""
        code, texte = self.TOUCHES[nom]
        commun = {"key": nom, "code": "Space" if nom == " " else nom, "windowsVirtualKeyCode": code}
        self.envoyer("Input.dispatchKeyEvent", dict(commun, type="keyDown", **({"text": texte} if texte else {})))
        self.envoyer("Input.dispatchKeyEvent", dict(commun, type="keyUp"))

    def theme(self, sombre):
        self.envoyer("Emulation.setEmulatedMedia",
                     {"features": [{"name": "prefers-color-scheme", "value": "dark" if sombre else "light"}]})

    def incidents(self):
        """Erreurs survenues depuis le dernier appel : exceptions, console.error, fichiers du site introuvables."""
        vus, demandes = [], {}
        while True:
            try:
                d = self.evenements.get_nowait()
            except queue.Empty:
                break
            m, p = d.get("method"), d.get("params", {})
            if m == "Runtime.exceptionThrown":
                e = p["exceptionDetails"]
                vus.append("exception : %s" % (e.get("exception", {}).get("description") or e.get("text")))
            elif m == "Runtime.consoleAPICalled" and p.get("type") == "error":
                vus.append("console.error : " + " ".join(str(a.get("value", a.get("description"))) for a in p["args"]))
            elif m == "Network.requestWillBeSent":
                demandes[p["requestId"]] = p["request"]["url"]
            elif m == "Network.responseReceived" and p["response"]["status"] >= 400:
                if p["response"]["url"].endswith("/favicon.ico"):      # demandé d'office par Chrome ; le site n'en a pas
                    continue
                vus.append("HTTP %d : %s" % (p["response"]["status"], p["response"]["url"]))
            elif m == "Network.loadingFailed" and not p.get("canceled") and p.get("blockedReason") != "inspector":
                vus.append("échec réseau (%s) : %s" % (p.get("errorText"), demandes.get(p["requestId"], "?")))
        return vus

    def fermer(self):
        self.chrome.pages.pop(self.session, None)
        try:
            self.chrome.envoyer("Target.disposeBrowserContext", {"browserContextId": self.ctx})
        except Erreur:
            pass
