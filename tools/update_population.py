#!/usr/bin/env python3
"""Met à jour data/population.json, la copie embarquée des données de la vue « Population ».

    python3 tools/update_population.py [source]

`source` est un chemin ou une adresse ; par défaut, le fichier export/terre.json de la branche principale du dépôt
pib-mondial. La page fait la même comparaison à chaque chargement (elle prend le plus récent du fichier embarqué et
de celui du dépôt), mais seulement là où elle peut joindre GitHub : la copie embarquée sert hors ligne et dans
l'artefact publié, qui n'a pas le droit d'interroger un autre site. Après une mise à jour, republier l'artefact.
"""
import json, os, sys, urllib.request
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://raw.githubusercontent.com/fbastin/pib-mondial/main/export/terre.json"
DEST = os.path.join(ROOT, "data", "population.json")
FORMAT = 1


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else URL
    if src.startswith("http://") or src.startswith("https://"):
        with urllib.request.urlopen(src, timeout=60) as r:
            raw = r.read()
    else:
        with open(src, "rb") as f:
            raw = f.read()
    new = json.loads(raw)
    if new.get("format") != FORMAT:
        sys.exit("Format %r inconnu (attendu : %d) : la page ne saurait pas le lire. Rien n'est changé." % (new.get("format"), FORMAT))
    when = datetime.fromisoformat(new["version"])
    if os.path.exists(DEST):
        with open(DEST, encoding="utf-8") as f:
            old = json.load(f)
        if datetime.fromisoformat(old["version"]) > when:
            sys.exit("La copie embarquée (%s) est plus récente que la source (%s). Rien n'est changé." % (old["version"], new["version"]))
        if old == new:
            print("Déjà à jour : version %s." % new["version"])
            return
    with open(DEST, "wb") as f:
        f.write(raw)
    print("data/population.json : version %s, %d pays, %d ko." % (new["version"], len(new["pays"]), len(raw) // 1000))


if __name__ == "__main__":
    main()
