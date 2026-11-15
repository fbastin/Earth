#!/usr/bin/env python3
"""Met à jour data/indicateurs.json, les indicateurs de la vue « Population » tirés d'Our World in Data.

    python3 tools/update_indicators.py

Pour chaque indicateur, le script télécharge le fichier CSV du graphique (pays, code, année, valeur) et ses
métadonnées, garde les années à partir de 1950 et les pays de la carte (data/pays.json), et écrit le tout dans un seul
fichier. La page ne joint jamais Our World in Data : elle ne lit que cette copie. Après une mise à jour, vérifier les
licences affichées par le script (elles doivent rester ouvertes), puis republier l'artefact.

Ajouter un indicateur : une ligne dans INDICATEURS ici, et sa description (couleurs, seuils, textes) dans globe.js.
"""
import csv, io, json, os, sys, urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(ROOT, "data", "indicateurs.json")
BASE = "https://ourworldindata.org/grapher/"
ARGS = "?v=1&csvType=full&useColumnShortNames=true"
DEBUT = 1950
FORMAT = 1
# clé dans la page : (graphique d'Our World in Data, nombre de décimales gardées)
INDICATEURS = {
    "fert": ("children-born-per-woman", 2),
    "life": ("life-expectancy", 1),
    "co2": ("co-emissions-per-capita", 2),
    "urban": ("share-of-population-urban", 1),
}
# Codes propres à Our World in Data -> codes de la carte ; "*" est le monde.
CODES = {"OWID_WRL": "*", "OWID_KOS": "XKX"}
SUFFIXES = (" – with major processing by Our World in Data", " – with minor processing by Our World in Data",
            " – processed by Our World in Data")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (update_indicators.py)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def licences(col):
    """Licences des sources d'origine, sans doublon ; liste vide si les métadonnées détaillées manquent."""
    try:
        full = json.loads(get(col["fullMetadata"]))
    except Exception:
        return []
    out = []
    for o in full.get("origins", []):
        lic = o.get("license") or {}
        item = {"producteur": o.get("producer") or "", "licence": lic.get("name") or "", "url": lic.get("url") or ""}
        if item not in out:
            out.append(item)
    return out


def indicateur(slug, dec, carte):
    meta = json.loads(get(BASE + slug + ".metadata.json" + ARGS))
    if len(meta.get("columns", {})) != 1:
        sys.exit("%s : une seule colonne de valeurs attendue, %d reçues." % (slug, len(meta.get("columns", {}))))
    col = next(iter(meta["columns"].values()))
    rows = list(csv.DictReader(io.StringIO(get(BASE + slug + ".csv" + ARGS).decode("utf-8"))))
    champ = [k for k in rows[0] if k not in ("entity", "code", "year")]
    if len(champ) != 1:
        sys.exit("%s : colonnes inattendues %r." % (slug, list(rows[0])))
    series = {}
    for r in rows:
        code = CODES.get(r["code"], r["code"])
        y = int(r["year"])
        if y < DEBUT or r[champ[0]] == "" or (code != "*" and code not in carte):
            continue
        v = round(float(r[champ[0]]), dec)
        series.setdefault(code, {})[y] = int(v) if v == int(v) else v
    if "*" not in series or len(series) < 150:
        sys.exit("%s : série du monde absente ou trop peu de pays (%d)." % (slug, len(series)))
    fin = max(max(s) for s in series.values())
    tab = {c: [s.get(y) for y in range(DEBUT, fin + 1)] for c, s in sorted(series.items())}
    source = col.get("citationShort") or ""
    for suf in SUFFIXES:
        source = source.replace(suf, "")
    lic = licences(col)
    print("%s : %d-%d, %d pays, mise à jour du %s" % (slug, DEBUT, fin, len(tab) - 1, col.get("lastUpdated")))
    for l in lic:
        print("         %s : %s" % (l["producteur"], l["licence"] or "licence non indiquée"))
    return {
        "graphique": BASE + slug, "titre": col.get("titleShort") or meta.get("chart", {}).get("title") or slug,
        "unite": col.get("unit") or "", "source": source, "maj": col.get("lastUpdated") or "",
        "prochaine_maj": col.get("nextUpdate") or "", "licences": lic,
        "debut": DEBUT, "fin": fin, "monde": tab.pop("*"), "pays": tab,
    }


def main():
    with open(os.path.join(ROOT, "data", "pays.json"), encoding="utf-8") as f:
        carte = {r[0] for r in json.load(f)}
    out = {"format": FORMAT, "version": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
           "origine": "Our World in Data (https://ourworldindata.org), CC BY 4.0 ; chaque série reste sous la licence de ses sources",
           "indicateurs": {k: indicateur(slug, dec, carte) for k, (slug, dec) in INDICATEURS.items()}}
    raw = json.dumps(out, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    tmp = DEST + ".part"
    with open(tmp, "wb") as f:
        f.write(raw)
    os.replace(tmp, DEST)
    print("data/indicateurs.json : %d indicateurs, %d ko." % (len(out["indicateurs"]), len(raw) // 1000))


if __name__ == "__main__":
    main()
