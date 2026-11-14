#!/usr/bin/env python3
"""Sert le site en local comme le fait l'artefact publié.

    python3 tools/serve.py [port]        (8000 par défaut), puis ouvrir http://localhost:8000/

À la publication, index.html est enveloppé dans une page complète (doctype, balise viewport, petite remise à zéro
des styles). Le fichier du dépôt ne contient pas cette enveloppe : il doit rester tel quel pour être publié. Ce serveur
l'ajoute à la volée, pour que la page locale s'affiche exactement comme la page publiée. Les autres fichiers
(globe.js, data/, tiles/) sont servis tels quels, sans mise en cache, pour voir tout de suite une modification.
"""
import os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Enveloppe ajoutée par la publication (relevée sur l'artefact).
HEAD = ('<!doctype html><html><head><meta charset=utf8>'
        '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);'
        'padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}'
        'body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}'
        'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n')
TAIL = '\n</body></html>'


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path.split("?")[0].split("#")[0] in ("/", "/index.html"):
            with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
                body = (HEAD + f.read() + TAIL).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()

    def log_message(self, fmt, *args):      # journal réduit aux erreurs
        if args and str(args[1])[:1] in "45":
            super().log_message(fmt, *args)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print("Site servi sur http://localhost:%d/  (Ctrl+C pour arrêter)" % port)
    try:
        ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
    except KeyboardInterrupt:
        pass
