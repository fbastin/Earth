#!/usr/bin/env python3
"""Fabrique les données du globe (dossiers tiles/ et data/) à partir de sources publiques.

    python tools/build_assets.py <dossier_cache> <dossier_du_site> [niveaux, p. ex. 0,1,2,3]

Sources
  - Images de jour : NASA Blue Marble (relief ombré et bathymétrie), service GIBS.
  - Lumières nocturnes : NASA Black Marble 2016 (VIIRS), service GIBS.
  - Relief : NOAA ETOPO2v2 (altitudes et profondeurs, maille de 2 minutes d'arc).
  - Côtes, frontières, pays, grandes villes : Natural Earth (domaine public).
  - Autres localités dont la population est connue, provinces et États, noms français et anglais : GeoNames (CC BY 4.0).
    (GeoNames ne donne pas la population de la plupart des hameaux : ceux-là ne sont pas repris.)

Dépendances : Pillow, numpy. Les téléchargements restent dans le cache ; relancer le script ne les refait pas.
"""
import io, json, os, sys, time, unicodedata, zipfile, urllib.request
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/{layer}/default/{date}/500m/{z}/{row}/{col}.{ext}"
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/{name}.geojson"
ETOPO = "https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2/ETOPO2v2-2006/ETOPO2v2c/raw_binary/ETOPO2v2c_i2_LSB.zip"
GEONAMES = "https://download.geonames.org/export/dump/"
DAY = ("BlueMarble_ShadedRelief_Bathymetry", "2004-08-01", "jpeg")
NIGHT = ("VIIRS_Black_Marble", "2016-01-01", "png")

# Niveaux publiés : (niveau GIBS, taille d'une tuile publiée en pixels, qualité JPEG).
# Au niveau GIBS z (z >= 3), la Terre fait 10·2^(z-3) × 5·2^(z-3) tuiles de 512 px.
# Le niveau 0 est une image unique ; les suivants sont découpés en tuiles carrées.
LEVELS = {0: (3, None, 86), 1: (4, 1024, 84), 2: (5, 2048, 82), 3: (6, 2048, 78)}


def fetch(url, path, tries=5):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    os.makedirs(os.path.dirname(path), exist_ok=True)
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "earth-teaching-site-build/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
            with open(path + ".part", "wb") as f:
                f.write(data)
            os.replace(path + ".part", path)
            return path
        except Exception as e:  # noqa: BLE001
            if k == tries - 1:
                raise RuntimeError("échec du téléchargement : %s (%s)" % (url, e))
            time.sleep(1.5 * (k + 1))


def gibs_tiles(cache, layer, z, cols, rows):
    name, date, ext = layer
    jobs = []
    for r in range(rows):
        for c in range(cols):
            url = GIBS.format(layer=name, date=date, z=z, row=r, col=c, ext=ext)
            jobs.append((url, os.path.join(cache, name, str(z), "%d_%d.%s" % (c, r, ext))))
    with ThreadPoolExecutor(12) as ex:
        list(ex.map(lambda j: fetch(*j), jobs))
    return lambda c, r: os.path.join(cache, name, str(z), "%d_%d.%s" % (c, r, ext))


def mosaic(path_of, c0, r0, nc, nr):
    im = Image.new("RGB", (512 * nc, 512 * nr))
    for r in range(nr):
        for c in range(nc):
            with Image.open(path_of(c0 + c, r0 + r)) as t:
                im.paste(t.convert("RGB"), (512 * c, 512 * r))
    return im


def build_day(cache, out, levels):
    meta = []
    for L in sorted(levels):
        z, size, q = LEVELS[L]
        d = os.path.join(out, "tiles", str(L))
        os.makedirs(d, exist_ok=True)
        if L == 0:  # une seule image pour la Terre entière, ramenée à 4096 px (taille de texture admise partout)
            p = gibs_tiles(cache, DAY, z, 10, 5)
            mosaic(p, 0, 0, 10, 5).resize((4096, 2048), Image.LANCZOS).save(os.path.join(d, "0_0.jpg"), quality=q, optimize=True, progressive=True)
            meta.append({"cols": 1, "rows": 1, "w": 4096, "h": 2048})
            continue
        n = 2 ** (z - 3)
        cols, rows, k = 10 * n, 5 * n, size // 512
        p = gibs_tiles(cache, DAY, z, cols, rows)
        for r in range(rows // k):
            for c in range(cols // k):
                mosaic(p, c * k, r * k, k, k).save(os.path.join(d, "%d_%d.jpg" % (c, r)), quality=q, optimize=True, progressive=True)
        meta.append({"cols": cols // k, "rows": rows // k, "w": size, "h": size})
        print("jour niveau", L, "ok", flush=True)
    return meta


def build_night(cache, out):
    p = gibs_tiles(cache, NIGHT, 3, 10, 5)
    im = mosaic(p, 0, 0, 10, 5).resize((4096, 2048), Image.LANCZOS)
    im.save(os.path.join(out, "tiles", "night.jpg"), quality=86, optimize=True)
    print("nuit ok", flush=True)


def build_elev(cache, out):
    z = fetch(ETOPO, os.path.join(cache, "etopo2.zip"))
    with zipfile.ZipFile(z) as zf:
        name = [n for n in zf.namelist() if n.lower().endswith(".bin")][0]
        raw = zf.read(name)
    a = np.frombuffer(raw, dtype="<i2").reshape(5400, 10800).astype(np.float32)
    print("relief : min %d m, max %d m" % (a.min(), a.max()), flush=True)
    im = Image.fromarray(a, mode="F").resize((2880, 1440), Image.BOX)
    v = np.clip(np.rint(np.asarray(im)) + 11000, 0, 65535).astype(np.uint16)
    rgb = np.zeros((1440, 2880, 3), np.uint8)
    rgb[..., 0] = v >> 8      # altitude + 11 000 m, sur 16 bits : octet fort dans le rouge,
    rgb[..., 1] = v & 255     # octet faible dans le vert
    Image.fromarray(rgb, "RGB").save(os.path.join(out, "data", "elev.png"), optimize=True)
    print("relief ok", flush=True)


def geo(cache, name):
    with open(fetch(NE.format(name=name), os.path.join(cache, "ne", name + ".geojson")), encoding="utf-8") as f:
        return json.load(f)


def lines_of(g):
    out = []
    def add(coords):
        pts, last = [], None
        for x, y in coords:
            q = (int(round(x * 100)), int(round(y * 100)))
            if q != last:
                pts.extend(q)
                last = q
        if len(pts) >= 4:
            out.append(pts)
    for f in g["features"]:
        gm = f["geometry"]
        if not gm:
            continue
        t, c = gm["type"], gm["coordinates"]
        if t == "LineString":
            add(c)
        elif t == "MultiLineString":
            for l in c:
                add(l)
        elif t == "Polygon":
            for l in c:
                add(l)
        elif t == "MultiPolygon":
            for poly in c:
                for l in poly:
                    add(l)
    return out


def build_vectors(cache, out):
    d = {"coast": lines_of(geo(cache, "ne_50m_coastline")),
         "borders": lines_of(geo(cache, "ne_50m_admin_0_boundary_lines_land")),
         "lakes": lines_of(geo(cache, "ne_50m_lakes"))}
    with open(os.path.join(out, "data", "lines.json"), "w", encoding="utf-8") as f:
        json.dump(d, f, separators=(",", ":"))
    print("lignes ok :", {k: sum(len(l) // 2 for l in v) for k, v in d.items()}, flush=True)


SHORT_FR = {"CHN": "Chine", "COD": "RD Congo", "ATF": "Terres australes françaises", "IOA": "Territoires australiens de l'océan Indien",
            "SGS": "Géorgie du Sud", "IOT": "Territoire britannique de l'océan Indien"}
SHORT_EN = {"USA": "United States", "CHN": "China", "COD": "DR Congo", "ATF": "French Southern Lands", "SGS": "South Georgia",
            "IOA": "Australian Indian Ocean Territories", "CYN": "Northern Cyprus"}


def span_of(geom, lat0):
    """Taille angulaire (degrés) du plus grand morceau du pays : sert à choisir le zoom d'arrivée."""
    polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    best = 0.0
    for poly in polys:
        xs = [p[0] for p in poly[0]]
        ys = [p[1] for p in poly[0]]
        dx = max(xs) - min(xs)
        if dx > 180:  # morceau à cheval sur l'antiméridien
            xs = [x % 360 for x in xs]
            dx = max(xs) - min(xs)
        c = float(np.cos(np.radians((max(ys) + min(ys)) / 2)))
        best = max(best, max(max(ys) - min(ys), dx * c))
    return round(best, 1)


def fold(s):
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    for a, b in (("ø", "o"), ("œ", "oe"), ("æ", "ae"), ("ß", "ss"), ("-", " "), ("'", " "), ("’", " "), (".", " ")):
        s = s.replace(a, b)
    return " ".join(s.split())


def geonames_cities(cache, ne_cities, ne_adm1, country_of):
    """Localités GeoNames de plus de 1 000 habitants absentes de Natural Earth, au même format que ses villes."""
    with zipfile.ZipFile(fetch(GEONAMES + "cities1000.zip", os.path.join(cache, "geonames", "cities1000.zip"))) as zf:
        rows = [l.split("\t") for l in zf.read("cities1000.txt").decode("utf-8").splitlines()]
    rows = [r for r in rows if r[7] not in ("PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH")]
    # villages et hameaux de 1 à 999 habitants : extraits une fois du fichier complet (1,6 Go), puis gardés en cache
    small_path = os.path.join(cache, "geonames", "villages_1_999.tsv")
    if not os.path.exists(small_path):
        have = {r[0] for r in rows}
        with zipfile.ZipFile(fetch(GEONAMES + "allCountries.zip", os.path.join(cache, "geonames", "allCountries.zip"))) as zf:
            with zf.open("allCountries.txt") as f, open(small_path + ".part", "w", encoding="utf-8") as o:
                for line in io.TextIOWrapper(f, encoding="utf-8"):
                    r = line.split("\t")
                    if r[6] == "P" and r[7] not in ("PPLX", "PPLH", "PPLQ", "PPLW", "PPLCH") and r[0] not in have and 1 <= int(r[14] or 0) < 1000:
                        o.write(line)
        os.replace(small_path + ".part", small_path)
    with open(small_path, encoding="utf-8") as f:
        villages = [l.rstrip("\n").split("\t") for l in f]
    n_big = len(rows)
    rows += villages
    # provinces, États, régions (premier niveau administratif) : code « CA.10 » -> [identifiant, nom]
    with open(fetch(GEONAMES + "admin1CodesASCII.txt", os.path.join(cache, "geonames", "admin1CodesASCII.txt")), encoding="utf-8") as f:
        adm = {c[0]: (c[3], c[1]) for c in (l.rstrip("\n").split("\t") for l in f) if len(c) > 3}
    ids = {r[0] for r in rows} | {a[0] for a in adm.values()}
    # noms français et anglais : le nom « préféré » s'il existe, sinon le premier nom courant
    names = {}
    with zipfile.ZipFile(fetch(GEONAMES + "alternateNamesV2.zip", os.path.join(cache, "geonames", "alternateNamesV2.zip"))) as zf:
        with zf.open("alternateNamesV2.txt") as f:
            for line in io.TextIOWrapper(f, encoding="utf-8"):
                c = line.rstrip("\n").split("\t")
                if c[2] not in ("fr", "en") or c[1] not in ids or (len(c) > 7 and (c[6] == "1" or c[7] == "1")):
                    continue
                key, pref = (c[1], c[2]), c[4] == "1"
                if key not in names or (pref and not names[key][1]):
                    names[key] = (c[3], pref)
    admins, admin_idx = [], {}
    def admin_of(r):
        code = r[8] + "." + r[10]
        if code not in adm:
            return -1
        if code not in admin_idx:
            gid, en = adm[code]
            fr = names.get((gid, "fr"), (en,))[0]
            if fr.startswith("Région ") and not fr[7:].startswith(("de ", "du ", "des ", "d'", "d’")):
                fr = fr[7:]
            admin_idx[code] = len(admins)
            admins.append([fr, "" if fr == en else en])
        return admin_idx[code]
    grid = {}
    for i, c in enumerate(ne_cities):
        grid.setdefault((round(c[3] * 4), round(c[4] * 4)), []).append((c[3], c[4], {fold(c[0]), fold(c[1] or c[0])}, i))
    out, ne_best = [], {}
    for k, r in enumerate(rows):
        lat, lon, pop = float(r[4]), float(r[5]), int(r[14] or 0)
        fr = names.get((r[0], "fr"), (r[1],))[0]
        en = names.get((r[0], "en"), (r[1],))[0]
        keys = {fold(r[1]), fold(r[2]), fold(fr), fold(en)}
        dup = False
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for la, lo, ks, i in grid.get((round(lat * 4) + a, round(lon * 4) + b), ()):
                    d = max(abs(la - lat), abs(lo - lon))
                    if d < 0.025 or (d < 0.3 and ks & keys):
                        dup = True
                        d2 = d - (1 if ks & keys else 0)      # la ville Natural Earth hérite de la province de son double GeoNames
                        if i not in ne_best or d2 < ne_best[i][0]:
                            ne_best[i] = (d2, admin_of(r))
        if dup:
            continue
        cap = 1 if r[7] == "PPLC" else 0
        rank = 3 if pop >= 1e6 else 4 if pop >= 5e5 else 5 if pop >= 2e5 else 6 if pop >= 1e5 else 7 if pop >= 5e4 else 8 if pop >= 2e4 else 9 if pop >= 1e4 else 10 if pop >= 5e3 else 11
        if cap:
            rank = min(rank, 4)
        if k >= n_big:
            rank = 12 if pop >= 500 else 13 if pop >= 100 else 14
        out.append([fr, "" if en == fr else en, country_of(r[8]), round(lat, 2), round(lon, 2), int(round(pop / 1000)), rank, cap, admin_of(r)])
    for i, c in enumerate(ne_cities):                      # sinon, le nom de région fourni par Natural Earth
        c[8] = ne_best[i][1] if i in ne_best else -1
        if c[8] < 0 and ne_adm1[i]:
            key = "ne:" + ne_adm1[i]
            if key not in admin_idx:
                admin_idx[key] = len(admins)
                admins.append([ne_adm1[i], ""])
            c[8] = admin_idx[key]
    return out, admins


def build_places(cache, out):
    def low(p):
        return {k.lower(): v for k, v in p.items()}
    countries, idx, iso2, iso2_any = [], {}, {}, {}
    for f in geo(cache, "ne_50m_admin_0_countries")["features"]:
        p = low(f["properties"])
        a3 = p["adm0_a3"]
        fr = SHORT_FR.get(a3) or p.get("name_fr") or p["name"]
        en = SHORT_EN.get(a3) or p.get("name_en") or p["name"]
        fr = fr[0].upper() + fr[1:]
        idx[a3] = len(countries)
        if (p.get("iso_a2_eh") or "-99") != "-99" and p.get("type") in ("Sovereign country", "Country"):
            iso2.setdefault(p["iso_a2_eh"], len(countries))
        iso2_any.setdefault(p.get("iso_a2_eh") or "-99", len(countries))
        # [nom fr, nom en, latitude, longitude, zoom minimal de l'étiquette × 10, taille en degrés]
        countries.append([fr, en, round(p["label_y"], 2), round(p["label_x"], 2), int(round((p.get("min_label") or 5) * 10)),
                          span_of(f["geometry"], p["label_y"])])
    cities, ne_adm1 = [], []
    for f in geo(cache, "ne_10m_populated_places")["features"]:
        p = low(f["properties"])
        en = p.get("name_en") or p["name"]
        fr = p.get("name_fr") or en
        lon, lat = f["geometry"]["coordinates"]
        cap = 1 if str(p.get("featurecla", "")).startswith("Admin-0 capital") else 0
        # [nom fr, nom en si différent, indice du pays, latitude, longitude, population (milliers), rang, capitale, indice de la province]
        cities.append([fr, "" if en == fr else en, idx.get(p.get("adm0_a3"), iso2.get(p.get("iso_a2"), -1)), round(lat, 3), round(lon, 3),
                       int(round((p.get("pop_max") or 0) / 1000)), int(p["scalerank"] if p.get("scalerank") is not None else 9), cap, -1])
        ne_adm1.append(p.get("adm1name") or "")
    n_ne = len(cities)
    more, admins = geonames_cities(cache, cities, ne_adm1, lambda cc: iso2.get(cc, iso2_any.get(cc, -1)))
    cities += more
    print("villes : %d de Natural Earth, %d ajoutées de GeoNames" % (n_ne, len(cities) - n_ne), flush=True)
    cities.sort(key=lambda c: (c[6], -c[7], -c[5]))
    hamlets = [c for c in cities if c[6] >= 14]           # moins de 100 habitants : chargé en dernier, au besoin
    with open(os.path.join(out, "data", "places-hamlets.json"), "w", encoding="utf-8") as f:
        json.dump({"cities": hamlets}, f, ensure_ascii=False, separators=(",", ":"))
    print("hameaux : %d" % len(hamlets), flush=True)
    tiny = [c for c in cities if 12 <= c[6] < 14]         # 100 à 999 habitants : chargé seulement au besoin
    small = [c for c in cities if c[6] == 11]             # moins de 5 000 habitants : fichier à part, chargé ensuite
    cities = [c for c in cities if c[6] < 11]
    with open(os.path.join(out, "data", "places-tiny.json"), "w", encoding="utf-8") as f:
        json.dump({"cities": tiny}, f, ensure_ascii=False, separators=(",", ":"))
    print("villages : %d" % len(tiny), flush=True)
    with open(os.path.join(out, "data", "places.json"), "w", encoding="utf-8") as f:
        json.dump({"countries": countries, "admins": admins, "cities": cities}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(out, "data", "places-small.json"), "w", encoding="utf-8") as f:
        json.dump({"cities": small}, f, ensure_ascii=False, separators=(",", ":"))
    print("petites localités : %d" % len(small), flush=True)
    print("lieux ok : %d pays, %d villes" % (len(countries), len(cities)), flush=True)


def main():
    cache, out = sys.argv[1], sys.argv[2]
    levels = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else [0, 1, 2, 3]
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    os.makedirs(os.path.join(out, "tiles"), exist_ok=True)
    build_vectors(cache, out)
    build_places(cache, out)
    build_elev(cache, out)
    build_night(cache, out)
    meta = build_day(cache, out, levels)
    with open(os.path.join(out, "tiles", "levels.json"), "w") as f:
        json.dump(meta, f)
    print("terminé", flush=True)


if __name__ == "__main__":
    main()
