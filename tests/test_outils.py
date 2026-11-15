"""Les scripts de tools/ : déploiement, mise à jour des données, serveur local. Rien n'est écrit dans le dépôt ni
demandé au réseau : chaque test travaille dans un dossier temporaire, avec de fausses sources."""
import contextlib, io, json, os, shutil, sys, tempfile, unittest, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import deploy, serve, update_indicators, update_population  # noqa: E402
from navigateur import Serveur  # noqa: E402


def ecrire(chemin, texte):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(texte)


def lire(chemin):
    with open(chemin, encoding="utf-8") as f:
        return f.read()


def lancer(module, *args):
    """Appelle main() comme en ligne de commande ; renvoie (ce qui est affiché, message d'arrêt ou None)."""
    sortie, arret, avant = io.StringIO(), None, sys.argv
    sys.argv = [module.__name__ + ".py"] + [str(a) for a in args]
    try:
        with contextlib.redirect_stdout(sortie), contextlib.redirect_stderr(sortie):
            module.main()
    except SystemExit as e:
        arret = e.code if e.code is not None else 0
    finally:
        sys.argv = avant
    return sortie.getvalue(), arret


class Temp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="terre-tests-")
        self.addCleanup(shutil.rmtree, self.tmp, True)


class Deploiement(Temp):
    """deploy.py, sur un faux dépôt réduit à quelques fichiers."""

    def setUp(self):
        super().setUp()
        self.depot, self.site = os.path.join(self.tmp, "depot"), os.path.join(self.tmp, "site")
        ecrire(os.path.join(self.depot, "index.html"), '<div id="page"></div>\n<script src="globe.js"></script>\n')
        ecrire(os.path.join(self.depot, "globe.js"), "var a=1;\n")
        ecrire(os.path.join(self.depot, "LICENSE"), "licence\n")
        ecrire(os.path.join(self.depot, "data/pays.json"), "[]")
        ecrire(os.path.join(self.depot, "data/population.json"), json.dumps({"version": "2026-01-01T00:00:00+00:00"}))
        ecrire(os.path.join(self.depot, "data/indicateurs.json"), json.dumps({"version": "2026-01-01T00:00:00+00:00"}))
        ecrire(os.path.join(self.depot, "tiles/0/0_0.jpg"), "image")
        ecrire(os.path.join(self.depot, "fonts/a.woff2"), "police")
        avant = deploy.ROOT
        deploy.ROOT = self.depot
        self.addCleanup(setattr, deploy, "ROOT", avant)

    def test_installation_complete(self):
        sortie, arret = lancer(deploy, self.site)
        self.assertIsNone(arret, sortie)
        for rel in ("index.html", "globe.js", "LICENSE", "data/pays.json", "tiles/0/0_0.jpg", "fonts/a.woff2"):
            self.assertTrue(os.path.exists(os.path.join(self.site, rel)), rel)
        page = lire(os.path.join(self.site, "index.html"))
        self.assertTrue(page.startswith("<!doctype html>"))
        self.assertTrue(page.rstrip().endswith("</html>"))
        self.assertRegex(page, r'<script src="globe\.js\?v=[0-9a-f]{10}"></script>')
        self.assertEqual([n for n in os.listdir(self.site) if n.endswith(".part")], [])

    def test_sans_enveloppe(self):
        lancer(deploy, self.site, "--no-wrap")
        page = lire(os.path.join(self.site, "index.html"))
        self.assertNotIn("<!doctype", page)
        self.assertNotIn("</html>", page)
        self.assertRegex(page, r"globe\.js\?v=[0-9a-f]{10}")

    def test_empreinte_suit_globe_js(self):
        lancer(deploy, self.site)
        avant = lire(os.path.join(self.site, "index.html"))
        ecrire(os.path.join(self.depot, "globe.js"), "var a=2;\n")
        sortie, _ = lancer(deploy, self.site)
        self.assertNotEqual(lire(os.path.join(self.site, "index.html")), avant)
        self.assertIn("globe.js", sortie)
        self.assertIn("index.html", sortie)

    def test_deuxieme_passage_ne_change_rien(self):
        lancer(deploy, self.site)
        dates = {n: os.stat(os.path.join(self.site, n)).st_mtime_ns for n in ("index.html", "globe.js")}
        sortie, _ = lancer(deploy, self.site)
        self.assertIn("Déjà à jour", sortie)
        self.assertEqual(dates, {n: os.stat(os.path.join(self.site, n)).st_mtime_ns for n in dates})

    def test_lien_de_retour(self):
        sortie, arret = lancer(deploy, self.site, "--back-url", "/accueil/{lang}/", "--back-fr", "Retour </script>", "--back-en", "Back")
        self.assertIsNone(arret, sortie)
        page = lire(os.path.join(self.site, "index.html"))
        self.assertIn("pfk-back", page)
        self.assertIn("/accueil/{lang}/", page)
        self.assertEqual(page.count("</script>"), 2, "le texte du lien ne doit pas pouvoir fermer le script")

    def test_options_incoherentes(self):
        for args in (["--back-url", "/x/"], ["--no-wrap", "--back-url", "/x/", "--back-fr", "a", "--back-en", "b"]):
            sortie, arret = lancer(deploy, self.site, *args)
            self.assertEqual(arret, 2, sortie)
        self.assertFalse(os.path.exists(self.site))

    def test_refuse_un_dossier_du_depot(self):
        sortie, arret = lancer(deploy, os.path.join(self.depot, "public"))
        self.assertEqual(arret, 2, sortie)
        self.assertFalse(os.path.exists(os.path.join(self.depot, "public")))

    def test_donnees_plus_recentes_gardees(self):
        lancer(deploy, self.site)
        recent = json.dumps({"version": "2026-06-01T00:00:00+00:00", "sur_place": True})
        ecrire(os.path.join(self.site, "data/population.json"), recent)
        sortie, _ = lancer(deploy, self.site)
        self.assertIn("gardé", sortie)
        self.assertEqual(lire(os.path.join(self.site, "data/population.json")), recent)

    def test_donnees_plus_anciennes_remplacees(self):
        lancer(deploy, self.site)
        ecrire(os.path.join(self.site, "data/indicateurs.json"), json.dumps({"version": "2025-01-01T00:00:00+00:00"}))
        lancer(deploy, self.site)
        self.assertEqual(json.loads(lire(os.path.join(self.site, "data/indicateurs.json")))["version"], "2026-01-01T00:00:00+00:00")

    def test_rien_n_est_supprime(self):
        lancer(deploy, self.site)
        ecrire(os.path.join(self.site, "autre.txt"), "à moi")
        lancer(deploy, self.site)
        self.assertTrue(os.path.exists(os.path.join(self.site, "autre.txt")))

    def test_balise_introuvable(self):
        ecrire(os.path.join(self.depot, "index.html"), "<p>sans script</p>")
        sortie, arret = lancer(deploy, self.site)
        self.assertIn("introuvable", str(arret))
        self.assertFalse(os.path.exists(os.path.join(self.site, "index.html")))


class MiseAJourPopulation(Temp):
    def setUp(self):
        super().setUp()
        self.dest = os.path.join(self.tmp, "data", "population.json")
        self.src = os.path.join(self.tmp, "source.json")
        self.ancien = {"format": 1, "version": "2026-03-01T00:00:00+00:00", "pays": {"FRA": {}}}
        ecrire(self.dest, json.dumps(self.ancien))

    def source(self, **champs):
        d = {"format": 1, "version": "2026-05-01T00:00:00+00:00", "pays": {"FRA": {}, "BEL": {}}}
        d.update(champs)
        ecrire(self.src, json.dumps({k: v for k, v in d.items() if v is not None}))

    def inchange(self):
        self.assertEqual(json.loads(lire(self.dest)), self.ancien)
        self.assertFalse(os.path.exists(self.dest + ".part"))

    def test_source_plus_recente(self):
        self.source()
        sortie, arret = lancer(update_population, self.src, "--out", self.tmp)
        self.assertIsNone(arret, sortie)
        self.assertEqual(lire(self.dest), lire(self.src))
        self.assertIn("2 pays", sortie)

    def test_out_avant_la_source(self):
        self.source()
        lancer(update_population, "--out", self.tmp, self.src)
        self.assertEqual(lire(self.dest), lire(self.src))

    def test_source_plus_ancienne(self):
        self.source(version="2025-01-01T00:00:00+00:00")
        sortie, arret = lancer(update_population, self.src, "--out", self.tmp)
        self.assertIn("plus récente", str(arret))
        self.inchange()

    def test_format_inconnu(self):
        self.source(format=2)
        sortie, arret = lancer(update_population, self.src, "--out", self.tmp)
        self.assertIn("Format", str(arret))
        self.inchange()

    def test_source_mal_formee(self):
        for champs in ({"pays": None}, {"version": None}, {"pays": []}):
            self.source(**champs)
            sortie, arret = lancer(update_population, self.src, "--out", self.tmp)
            self.assertIn("mal formée", str(arret), champs)
            self.inchange()

    def test_deja_a_jour(self):
        ecrire(self.src, json.dumps(self.ancien))
        sortie, arret = lancer(update_population, self.src, "--out", self.tmp)
        self.assertIsNone(arret)
        self.assertIn("Déjà à jour", sortie)

    def test_out_sans_dossier(self):
        sortie, arret = lancer(update_population, "--out")
        self.assertIn("--out", str(arret))


class MiseAJourIndicateurs(Temp):
    """update_indicators.py, avec un faux Our World in Data."""

    def setUp(self):
        super().setUp()
        self.codes = ["P%02d" % i for i in range(160)] + ["XKX"]
        ecrire(os.path.join(self.tmp, "data", "pays.json"), json.dumps([[c, 0, 0, 0, 0, 0] for c in self.codes]))
        self.dest = os.path.join(self.tmp, "data", "indicateurs.json")
        self.pays = self.codes[:160]
        self.colonnes = 1
        self.demandes = []
        avant = update_indicators.get
        update_indicators.get = self.faux_get
        self.addCleanup(setattr, update_indicators, "get", avant)

    def faux_get(self, url):
        self.demandes.append(url)
        if url == "meta://complet":
            return json.dumps({"origins": [{"producer": "ONU", "license": {"name": "CC BY 4.0", "url": "https://x/"}},
                                           {"producer": "ONU", "license": {"name": "CC BY 4.0", "url": "https://x/"}}]}).encode()
        if ".metadata.json" in url:
            col = {"titleShort": "Titre", "unit": "u", "lastUpdated": "2026-01-02", "nextUpdate": "2027-01-02",
                   "citationShort": "ONU (2026) – with major processing by Our World in Data", "fullMetadata": "meta://complet"}
            return json.dumps({"columns": {str(i): col for i in range(self.colonnes)}}).encode()
        lignes = ["entity,code,year,valeur"]
        for c in self.pays:
            lignes += ["Pays,%s,1949,9" % c, "Pays,%s,1950,1.234" % c, "Pays,%s,1952,3" % c]
        lignes += ["World,OWID_WRL,1950,2.5", "World,OWID_WRL,1951,", "World,OWID_WRL,1952,4",
                   "Kosovo,OWID_KOS,1951,7", "Ailleurs,ZZZ,1950,1", "Région,,1950,1"]
        return "\n".join(lignes).encode()

    def test_fichier_ecrit(self):
        sortie, arret = lancer(update_indicators, "--out", self.tmp)
        self.assertIsNone(arret, sortie)
        d = json.loads(lire(self.dest))
        self.assertEqual(d["format"], 1)
        self.assertEqual(set(d["indicateurs"]), set(update_indicators.INDICATEURS))
        f = d["indicateurs"]["fert"]
        self.assertEqual((f["debut"], f["fin"]), (1950, 1952))
        self.assertEqual(f["monde"], [2.5, None, 4], "trou gardé, valeurs entières sans décimale")
        self.assertEqual(f["pays"]["P00"], [1.23, None, 3], "arrondi au nombre de décimales de l'indicateur")
        self.assertEqual(d["indicateurs"]["life"]["pays"]["P00"], [1.2, None, 3])
        self.assertEqual(f["pays"]["XKX"], [None, 7, None], "code d'Our World in Data ramené à celui de la carte")
        self.assertNotIn("ZZZ", f["pays"])
        self.assertNotIn("", f["pays"])
        self.assertNotIn("*", f["pays"])
        self.assertEqual(f["source"], "ONU (2026)")
        self.assertEqual(f["licences"], [{"producteur": "ONU", "licence": "CC BY 4.0", "url": "https://x/"}])
        self.assertEqual((f["maj"], f["prochaine_maj"]), ("2026-01-02", "2027-01-02"))
        self.assertFalse(os.path.exists(self.dest + ".part"))
        self.assertTrue(all(u.startswith(("https://ourworldindata.org/grapher/", "meta://")) for u in self.demandes))

    def test_trop_peu_de_pays(self):
        ecrire(self.dest, "ancien")
        self.pays = self.codes[:20]
        sortie, arret = lancer(update_indicators, "--out", self.tmp)
        self.assertIn("trop peu de pays", str(arret))
        self.assertEqual(lire(self.dest), "ancien")

    def test_plusieurs_colonnes(self):
        ecrire(self.dest, "ancien")
        self.colonnes = 2
        sortie, arret = lancer(update_indicators, "--out", self.tmp)
        self.assertIn("une seule colonne", str(arret))
        self.assertEqual(lire(self.dest), "ancien")

    def test_arguments(self):
        sortie, arret = lancer(update_indicators, "ailleurs")
        self.assertIn("Usage", str(arret))


class ServeurLocal(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.s = Serveur()
        cls.addClassCleanup(cls.s.fermer)

    def get(self, chemin):
        with urllib.request.urlopen(self.s.url + chemin, timeout=10) as r:
            return r.headers, r.read()

    def test_page_enveloppee(self):
        for chemin in ("", "index.html", "?x=1"):
            h, corps = self.get(chemin)
            page = corps.decode("utf-8")
            self.assertTrue(page.startswith(serve.HEAD), chemin)
            self.assertTrue(page.endswith(serve.TAIL), chemin)
            self.assertIn("text/html", h["Content-Type"])
            self.assertEqual(h["Cache-Control"], "no-store")

    def test_autres_fichiers_tels_quels(self):
        h, corps = self.get("globe.js")
        with open(os.path.join(ROOT, "globe.js"), "rb") as f:
            self.assertEqual(corps, f.read())
        self.assertEqual(h["Cache-Control"], "no-store")


if __name__ == "__main__":
    unittest.main()
