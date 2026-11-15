"""Les fichiers livrés avec le site : forme des données, fichiers cités par la page, cohérence entre eux."""
import json, os, re, sys, unittest
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))


def lire(rel):
    with open(os.path.join(ROOT, rel), encoding="utf-8") as f:
        return f.read()


def charger(rel):
    return json.loads(lire(rel))


def nombre(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


class Carte(unittest.TestCase):
    def test_pays(self):
        pays = charger("data/pays.json")
        # Plusieurs territoires de la carte peuvent porter le même code (la page retient le plus grand) ; le rang
        # de chacun tient dans un octet de data/pays.png, dont 0 est la mer.
        self.assertGreater(len(pays), 200)
        self.assertLessEqual(len(pays), 255)
        for r in pays:
            self.assertEqual(len(r), 6, r)
            self.assertRegex(r[0], r"^[A-Z]{3}$")

    def test_niveaux_et_tuiles(self):
        niveaux = charger("tiles/levels.json")
        self.assertGreaterEqual(len(niveaux), 1)
        for L, m in enumerate(niveaux):
            for cle in ("cols", "rows", "w", "h"):
                self.assertIsInstance(m[cle], int, "niveau %d : %s" % (L, cle))
            manquantes = [("%d/%d_%d.jpg" % (L, c, r)) for c in range(m["cols"]) for r in range(m["rows"])
                          if not os.path.exists(os.path.join(ROOT, "tiles", str(L), "%d_%d.jpg" % (c, r)))]
            self.assertEqual(manquantes[:5], [], "tuiles absentes au niveau %d (%d en tout)" % (L, len(manquantes)))
        self.assertTrue(os.path.exists(os.path.join(ROOT, "tiles", "night.jpg")))

    def test_lignes(self):
        d = charger("data/lines.json")
        for cle in ("coast", "borders", "lakes"):
            self.assertTrue(d[cle], cle)
            for ligne in d[cle][:50]:
                self.assertEqual(len(ligne) % 2, 0, "%s : une ligne est une suite de paires" % cle)

    def test_lieux(self):
        d = charger("data/places.json")
        codes = {r[0] for r in charger("data/pays.json")}
        self.assertGreater(len(d["cities"]), 10000)
        self.assertGreater(len(d["countries"]), 200)
        self.assertTrue(d["admins"])
        largeur = len(d["cities"][0])
        for rel in ("data/places-small.json", "data/places-tiny.json", "data/places-hamlets.json"):
            plus = charger(rel)["cities"]
            self.assertTrue(plus, rel)
            self.assertEqual(len(plus[0]), largeur, "%s : même forme que places.json" % rel)
        self.assertTrue(codes)


class Population(unittest.TestCase):
    """Les mêmes exigences que okPop() dans globe.js : une copie que la page refuserait ne doit pas être livrée."""

    @classmethod
    def setUpClass(cls):
        cls.d = charger("data/population.json")

    def serie(self, a, maxi, exact=False, quoi=""):
        self.assertIsInstance(a, list, quoi)
        if exact:
            self.assertEqual(len(a), maxi, quoi)
        else:
            self.assertLessEqual(len(a), maxi, quoi)
        for v in a:
            self.assertTrue(v is None or (nombre(v) and v >= 0), "%s : valeur %r" % (quoi, v))

    def test_forme(self):
        d = self.d
        self.assertEqual(d["format"], 1)
        datetime.fromisoformat(d["version"])
        for bloc in ("population", "pib"):
            m = d[bloc]
            self.assertLessEqual(m["debut"], m["observe_jusqua"])
            self.assertLessEqual(m["observe_jusqua"], m["fin"])
            self.assertTrue(m["debut"] <= m["fourchette_des"] <= m["fin"])
        P, G = d["population"], d["pib"]
        nP, nG = P["fin"] - P["debut"] + 1, G["fin"] - G["debut"] + 1
        fP, fG = P["fin"] - P["fourchette_des"] + 1, G["fin"] - G["fourchette_des"] + 1
        self.serie(d["monde"]["pop"], nP, True, "monde")
        self.assertGreaterEqual(len(d["pays"]), 150)
        for code, f in d["pays"].items():
            self.serie(f["pop"], nP, quoi=code + ".pop")
            for cle, maxi in (("pib", nG), ("pop_bas", fP), ("pop_haut", fP), ("pib_bas", fG), ("pib_haut", fG)):
                if cle in f:
                    self.serie(f[cle], maxi, quoi="%s.%s" % (code, cle))
            if "nom" in f:
                self.assertIsInstance(f["nom"], str)

    def test_pays_de_la_carte(self):
        codes = {r[0] for r in charger("data/pays.json")}
        communs = codes & set(self.d["pays"])
        self.assertGreater(len(communs), 180, "trop peu de pays de la carte ont des données")

    def test_ordre_de_grandeur(self):
        P = self.d["population"]
        monde = self.d["monde"]["pop"]
        self.assertAlmostEqual(monde[2020 - P["debut"]] / 1e6, 7.9, delta=0.3)     # milliers d'habitants


class Indicateurs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.d = charger("data/indicateurs.json")

    def test_forme(self):
        d = self.d
        codes = {r[0] for r in charger("data/pays.json")}
        self.assertEqual(d["format"], 1)
        datetime.fromisoformat(d["version"])
        for cle, f in d["indicateurs"].items():
            n = f["fin"] - f["debut"] + 1
            self.assertGreater(n, 1, cle)
            self.assertEqual(len(f["monde"]), n, cle + " : monde")
            self.assertGreaterEqual(len(f["pays"]), 150, cle)
            self.assertEqual(set(f["pays"]) - codes, set(), cle + " : pays absents de la carte")
            for code, s in f["pays"].items():
                self.assertEqual(len(s), n, "%s.%s" % (cle, code))
                self.assertTrue(all(v is None or nombre(v) for v in s), "%s.%s" % (cle, code))
            self.assertTrue(f["source"], cle + " : source")
            self.assertTrue(f["monde"][-1] is not None or f["monde"][-2] is not None, cle + " : monde sans valeur récente")

    def test_memes_indicateurs_partout(self):
        """Le script de mise à jour, le fichier livré, les boutons de la page et globe.js parlent des mêmes indicateurs."""
        import update_indicators
        cles = set(update_indicators.INDICATEURS)
        self.assertEqual(set(self.d["indicateurs"]), cles)
        boutons = set(re.findall(r'data-ind="(\w+)"', lire("index.html")))
        self.assertEqual(boutons - {"pop", "growth", "gdp"}, cles)
        globe = lire("globe.js")
        for cle in cles:
            self.assertRegex(globe, r"\b%s:" % cle, "globe.js ne décrit pas l'indicateur " + cle)

    def test_ordres_de_grandeur(self):
        ind = self.d["indicateurs"]

        def monde(cle, an):
            return ind[cle]["monde"][an - ind[cle]["debut"]]

        self.assertTrue(2 < monde("fert", 2020) < 3)
        self.assertTrue(68 < monde("life", 2019) < 76)
        self.assertTrue(3 < monde("co2", 2019) < 6)
        self.assertTrue(50 < monde("urban", 2020) < 62)


class Page(unittest.TestCase):
    """Ce dont dépendent la publication et le déploiement."""

    @classmethod
    def setUpClass(cls):
        cls.html, cls.js = lire("index.html"), lire("globe.js")

    def test_sans_enveloppe(self):
        debut = self.html.lstrip()[:200].lower()
        self.assertNotIn("<!doctype", debut, "index.html doit rester sans enveloppe : elle est ajoutée à la publication")
        self.assertNotIn("<html", self.html.lower())

    def test_une_seule_balise_globe(self):
        self.assertEqual(self.html.count('<script src="globe.js"></script>'), 1, "tools/deploy.py remplace cette balise")

    def test_rien_ne_vient_d_ailleurs(self):
        """Scripts, styles, polices et images viennent du site : l'artefact publié n'a pas le droit d'aller ailleurs."""
        dehors = re.findall(r'(?:src|href)\s*=\s*["\'](?:https?:)?//[^"\']+["\']', self.html)
        liens = [d for d in dehors if not re.search(r'<a\b[^>]*' + re.escape(d), self.html)]
        self.assertEqual(liens, [], "ressources chargées depuis un autre site")
        self.assertEqual(re.findall(r'url\(\s*["\']?(?:https?:)?//', self.html), [])
        self.assertNotIn("@import", self.html)

    def test_fichiers_cites(self):
        cites = set(re.findall(r'url\(\s*["\']?((?:fonts|data|tiles)/[^"\')]+)', self.html))
        cites |= set(re.findall(r'["\']((?:data|tiles)/[\w./-]+\.(?:json|png|jpg))["\']', self.js))
        cites |= {"data/" + n for n in re.findall(r'["\'](places-[\w-]+\.json)["\']', self.js)}
        self.assertGreater(len(cites), 8)
        absents = sorted(c for c in cites if not os.path.exists(os.path.join(ROOT, c)))
        self.assertEqual(absents, [])

    def test_identifiants_uniques(self):
        ids = re.findall(r'\bid="([^"]+)"', self.html.split("<script")[0] + "".join(re.findall(r"</script>(.*?)(?=<script|\Z)", self.html, re.S)))
        doubles = sorted({i for i in ids if ids.count(i) > 1})
        self.assertEqual(doubles, [])


if __name__ == "__main__":
    unittest.main()
