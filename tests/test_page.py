"""La page elle-même, dans un Chrome sans interface : chargement, cinq vues, deux langues, pannes de réseau,
écran étroit, écran tactile, perte de l'affichage 3D, navigateur sans WebGL.

Ces tests sont sautés si aucun Chrome n'est trouvé (voir navigateur.py) ; avec la variable EXIGER_NAVIGATEUR, cette
absence est une erreur (c'est le réglage des tests lancés par GitHub). Chaque test ouvre une page dans un profil
vierge et échoue aussi si la page a levé une exception, écrit une erreur dans la console ou demandé un fichier
introuvable.
"""
import json, os, sys, time, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import navigateur  # noqa: E402

VUES = ["globe", "jour", "fuseaux", "population", "saisons"]
PRET = "window.EarthGlobe&&EarthGlobe.stats().tiles>0&&EarthGlobe.stats().loading===0"
INDICATEURS_PRETS = "!document.querySelector('#pInd button[data-ind=fert]').disabled"
# Texte visible qui trahit une traduction ou une valeur manquante.
DEFAUTS = r"(document.body.innerText.match(/\{\d\}|undefined|NaN|\[object/g)||[]).join(' ')"

serveur = chrome = None


def setUpModule():
    global serveur, chrome
    chemin = navigateur.trouver()
    if not chemin:
        if os.environ.get("EXIGER_NAVIGATEUR"):
            raise RuntimeError("aucun Chrome trouvé, alors que EXIGER_NAVIGATEUR interdit de sauter les tests de la page")
        raise unittest.SkipTest("aucun Chrome trouvé (variable CHROME, cache de Playwright ou commande chromium)")
    serveur = navigateur.Serveur()
    chrome = navigateur.Chrome(chemin)


def tearDownModule():
    if chrome:
        chrome.fermer()
    if serveur:
        serveur.fermer()


class Base(unittest.TestCase):
    navigateur = None           # un autre Chrome que celui du module, pour les tests qui en lancent un

    def ouvrir(self, vue="globe", langue="fr", pret=True, sans=(), **options):
        """Ouvre une vue dans une page neuve ; `sans` : motifs d'adresses que le réseau refuse dès le chargement."""
        p = (self.navigateur or chrome).page(**options)
        self.pages.append(p)
        p.bloquer(*sans)
        p.ouvrir(serveur.url + "#%s-%s" % (vue, langue))
        if pret:
            p.attendre(PRET, quoi="globe chargé")
        return p

    def setUp(self):
        self.pages = []

    def tearDown(self):
        time.sleep(0.2)
        incidents = [i for p in self.pages for i in p.incidents()]
        for p in self.pages:
            p.fermer()
        self.assertEqual(incidents, [], "la page a signalé des erreurs")

    def immobile(self, p):
        """Attend la fin d'un déplacement animé du globe."""
        p.js("window._cam=''")
        p.attendre("(function(){var c=JSON.stringify(EarthGlobe.cam), m=c===window._cam; window._cam=c; return m})()", delai=15)

    def vue(self, p, nom):
        p.cliquer(".tabs a[data-view=%s]" % nom)
        p.attendre("!document.getElementById('view-%s').hidden" % nom)
        time.sleep(0.4)


class Chargement(Base):
    def test_page_complete(self):
        p = self.ouvrir()
        self.assertEqual(p.js("document.compatMode"), "CSS1Compat", "page en mode standard")
        self.assertTrue(p.js("document.getElementById('gMsg').hidden"), p.js("gMsg.textContent"))
        self.assertEqual(p.js("document.documentElement.lang"), "fr")
        self.assertEqual(p.js("document.title"), "Globe terrestre")
        p.attendre("document.fonts.status==='loaded'")
        for police in ("Instrument Sans", "Bricolage Grotesque"):
            self.assertTrue(p.js("document.fonts.check('16px \"%s\"')" % police), police)
        dehors = p.js("performance.getEntriesByType('resource').map(r=>r.name).filter(n=>!n.startsWith(location.origin)"
                      "&&!/raw\\.githubusercontent\\.com/.test(n)).join(' ')")
        self.assertEqual(dehors, "", "ressources demandées à un autre site")

    def test_chaque_vue(self):
        p = self.ouvrir()
        titres = {}
        for v in VUES[1:] + VUES[:1]:
            self.vue(p, v)
            visibles = p.js("[...document.querySelectorAll('[id^=view-]')].filter(e=>!e.hidden).map(e=>e.id).join(' ')")
            self.assertEqual(visibles, "view-" + v)
            self.assertEqual(p.js("location.hash"), "#%s-fr" % v)
            self.assertEqual(p.js("document.querySelector('.tabs a[aria-current=page]').dataset.view"), v)
            self.assertEqual(p.js("document.getElementById('page').dataset.view"), v)
            self.assertEqual(p.js(DEFAUTS), "", "vue " + v)
            titres[v] = p.js("document.title")
        self.assertEqual(len(set(titres.values())), len(VUES), "un titre de page par vue")

    def test_adresses(self):
        p = self.ouvrir("saisons", "en", pret=False)
        p.attendre("window.Site&&Site.view==='saisons'")
        self.assertEqual(p.js("Site.lang+' '+document.documentElement.lang"), "en en")
        for adresse, attendu in (("#timezones-en", "fuseaux en"), ("#day", "jour en"), ("#fr", "saisons fr"),
                                 ("#nimporte", "globe fr"), ("#population-fr", "population fr"), ("#jour-fr", "jour fr")):
            p.js("location.hash=%s" % json.dumps(adresse))
            p.attendre("Site.view+' '+Site.lang===%s" % json.dumps(attendu), delai=5, quoi="%r mène à %s" % (adresse, attendu))
        p.js("history.back()")
        p.attendre("Site.view==='population'", delai=5, quoi="« Retour » revient à la vue précédente")

    def test_preferences_illisibles(self):
        """Ce que le navigateur a gardé d'une visite précédente peut être abîmé : la page doit s'en passer."""
        p = self.ouvrir()
        mauvais = ["{", "null", "[]", '"texte"', '{"globe":7,"pop":"x","tz":[],"lesson":null}',
                   '{"globe":{"ex":"beaucoup","mode":9},"pop":{"ind":"inconnu","year":-5,"iso":3},'
                   '"tz":{"step":99,"a":{"lat":"x"}},"lesson":{"step":-1,"show":4,"place":{"lat":1e9}}}']
        vues = ["globe", "population", "fuseaux", "jour"]
        essais = [(m, vues[i % 4]) for i, m in enumerate(mauvais[:-1])] + [(mauvais[-1], v) for v in vues]
        for m, v in essais:
            p.js("(localStorage.setItem('terre-choix',%s),localStorage.setItem('terre-population','{'),"
                 "localStorage.setItem('saisons-lang','xx'))" % json.dumps(m))
            p.ouvrir(serveur.url + "#%s-fr" % v)
            p.recharger()
            p.attendre(PRET, quoi="globe chargé avec les préférences %s (vue %s)" % (m, v))
            time.sleep(0.3)
            self.assertEqual(p.incidents(), [], "préférences %s, vue %s" % (m, v))
            self.assertEqual(p.js(DEFAUTS), "", "préférences %s, vue %s" % (m, v))

    def test_choix_memorises(self):
        p = self.ouvrir()
        avant = p.js("gGrid.checked")
        p.cliquer("#gGrid")
        p.recharger()
        p.attendre(PRET)
        self.assertEqual(p.js("gGrid.checked"), not avant)


class Langues(Base):
    def test_anglais_complet(self):
        p = self.ouvrir()
        francais = p.js("document.querySelector('.tabs').innerText")
        p.cliquer("#lang-en")
        p.attendre("document.documentElement.lang==='en'")
        self.assertEqual(p.js("location.hash"), "#globe-en")
        self.assertEqual(p.js("document.querySelector('.tabs a[data-view=globe]').textContent"), "3D Globe")
        self.assertNotEqual(p.js("document.querySelector('.tabs').innerText"), francais)
        self.assertEqual(p.js("lang_en=document.getElementById('lang-en').getAttribute('aria-pressed')"), "true")
        manquants = p.js("[...document.querySelectorAll('[data-i18n]')].map(e=>e.getAttribute('data-i18n'))"
                         ".concat([...document.querySelectorAll('[data-i18n-attr]')].flatMap(e=>e.getAttribute('data-i18n-attr')"
                         ".split(';').map(x=>x.split(':')[1]))).filter(k=>Site.EN[k]===undefined).join(' ')")
        self.assertEqual(manquants, "", "textes de la page sans traduction anglaise")
        for v in VUES[1:]:
            self.vue(p, v)
            self.assertEqual(p.js(DEFAUTS), "", "vue %s en anglais" % v)
            self.assertEqual(p.js("location.hash"), "#%s-en" % v)

    def test_tables_de_textes(self):
        """Chaque texte des tables D a ses deux langues, de même forme et avec les mêmes paramètres {0}, {1}…"""
        p = self.ouvrir(pret=False)
        p.attendre("window.Site")
        for fichier in ("globe.js", "index.html"):
            r = p.js("""fetch(%s).then(r=>r.text()).then(function(s){
              var i=s.indexOf('\\nvar D={'), j=s.indexOf('\\n};',i), D=eval('('+s.slice(i+7,j+2)+')'), mal=[];
              function trous(x){ return (JSON.stringify(x).match(/\\{\\d\\}/g)||[]).sort().join(''); }
              function forme(x){ return Array.isArray(x)?'['+x.length+']':typeof x; }
              Object.keys(D).forEach(function(k){ var v=D[k];
                if(!Array.isArray(v)||v.length!==2||forme(v[0])!==forme(v[1])||trous(v[0])!==trous(v[1])||v[0]===''||v[1]==='') mal.push(k); });
              return Object.keys(D).length+':'+mal.join(' '); })""" % json.dumps(fichier))
            n, mal = r.split(":")
            self.assertGreater(int(n), 20, fichier)
            self.assertEqual(mal, "", "%s : textes incomplets dans D" % fichier)

    def test_langue_retenue(self):
        p = self.ouvrir()
        p.cliquer("#lang-en")
        p.ouvrir("about:blank")
        p.attendre("location.href==='about:blank'")
        p.ouvrir(serveur.url)
        p.attendre("window.Site&&Site.lang==='en'&&document.documentElement.lang==='en'", delai=10, quoi="la langue choisie est retenue d'une visite à l'autre")

    def test_messages_retraduits(self):
        p = self.ouvrir()
        if p.js("EarthGlobe.stats().soft"):
            self.skipTest("pas de WebGL dans ce navigateur")
        p.js("document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
        p.attendre("!gMsg.hidden")
        fr = p.js("gMsg.textContent")
        p.cliquer("#lang-en")
        p.attendre("gMsg.textContent!==%s" % json.dumps(fr), delai=5, quoi="message en cours traduit au changement de langue")


class Globe(Base):
    def test_recherche(self):
        p = self.ouvrir()
        liste = "[...gqList.children].map(l=>l.textContent).join(' | ')"
        p.saisir("gq", "sherbro")
        p.attendre("/Sherbrooke/.test(%s)" % liste, quoi="Sherbrooke proposée")
        p.saisir("gq", "tromso")
        p.attendre("/^Tromsø/.test(%s)" % liste, quoi="recherche sans accents : Tromsø en tête")
        p.js("gq.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
        p.attendre("Math.abs(EarthGlobe.cam.lat-69.6)<0.5&&Math.abs(EarthGlobe.cam.lon-18.9)<0.5", quoi="le globe va à Tromsø")
        p.saisir("gq", "zzzzqqq")
        time.sleep(0.5)
        self.assertEqual(p.js("gqList.children.length"), 0)

    def test_entree_sans_attendre(self):
        p = self.ouvrir()
        p.attendre("/Paris/.test((function(){gq.value='paris';gq.dispatchEvent(new Event('input',{bubbles:true}));"
                   "return gqList.textContent})())", quoi="lieux chargés")
        p.saisir("gq", "tromso")
        p.js("gq.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))")
        p.attendre("Math.abs(EarthGlobe.cam.lat-69.6)<0.5", quoi="Entrée juste après la frappe vise le bon lieu")

    def test_affichage_perdu_puis_rendu(self):
        p = self.ouvrir()
        if p.js("EarthGlobe.stats().soft"):
            self.skipTest("pas de WebGL dans ce navigateur")
        p.js("(window._x=document.getElementById('gl').getContext('webgl2').getExtension('WEBGL_lose_context'), _x.loseContext())")
        p.attendre("!gMsg.hidden&&EarthGlobe.stats().tiles===0", quoi="message d'interruption")
        p.js("_x.restoreContext()")
        p.attendre(PRET + "&&gMsg.hidden", quoi="globe rétabli, message retiré")

    def test_tuiles_en_panne(self):
        p = self.ouvrir(pret=False, sans=["*tiles/0/*"])
        p.attendre("window.EarthGlobe&&!gMsg.hidden&&/n'ont pas pu être chargées/.test(gMsg.textContent)",
                   quoi="message quand les images du globe ne viennent pas")
        p.bloquer()
        p.attendre(PRET + "&&gMsg.hidden", delai=60, quoi="nouvel essai réussi une fois le réseau rétabli")

    def test_lieux_en_panne(self):
        p = self.ouvrir(sans=["*places.json*"])
        p.saisir("gq", "paris")
        p.attendre("!gqHead.hidden&&gqHead.textContent.length>10", quoi="message quand la liste des lieux manque")
        p.bloquer()
        p.attendre("(function(){gq.value='pari';gq.dispatchEvent(new Event('input',{bubbles:true}));"
                   "return /Paris/.test(gqList.textContent)})()", delai=60, quoi="lieux chargés une fois le réseau rétabli")


class SansWebGL(Base):
    """Le rendu de secours, calculé sans carte graphique."""

    @classmethod
    def setUpClass(cls):
        cls.navigateur = navigateur.Chrome(navigateur.trouver(), ["--disable-3d-apis"])
        cls.addClassCleanup(cls.navigateur.fermer)

    def test_rendu_de_secours(self):
        p = self.ouvrir()
        self.assertTrue(p.js("EarthGlobe.stats().soft"))
        self.assertTrue(p.js("gMsg.hidden"), p.js("gMsg.textContent"))
        for v in ("jour", "fuseaux", "population"):
            self.vue(p, v)
            p.attendre(PRET)
            self.assertEqual(p.js(DEFAUTS), "", v)
        p.attendre(INDICATEURS_PRETS)
        p.cliquer("#pInd button[data-ind=life]")
        p.attendre("/ans/.test(pWorld.textContent)", delai=10)


class JourEtNuit(Base):
    def test_lecture(self):
        p = self.ouvrir("jour")
        self.assertGreater(len(p.js("jLive.textContent")), 20)
        avant = p.js("jTime.textContent")
        if p.js("jPlay.getAttribute('aria-pressed')") != "true":
            p.cliquer("#jPlay")
        p.attendre("jTime.textContent!==%s" % json.dumps(avant), delai=10, quoi="l'heure avance pendant la lecture")

    def test_jour_choisi(self):
        p = self.ouvrir("jour")
        p.regler("jDay", 171)
        p.attendre("/21 juin/.test(jTime.textContent)", delai=5)
        p.regler("jDay", 364)
        p.attendre("/31 décembre/.test(jTime.textContent)", delai=5)

    def test_inclinaison_et_duree_du_jour(self):
        p = self.ouvrir("jour")
        p.cliquer('#jSteps li[data-step="4"] button[data-jday="171"]')      # étape 5, 21 juin, Montréal suivie
        p.attendre("!jDayBox.hidden", delai=10, quoi="durée du jour de la ville suivie")
        p.cliquer('button[data-jtilt="0"]')
        p.attendre("/le jour dure 12 h et la nuit 12 h/.test(jDayTxt.textContent)", delai=5,
                   quoi="axe redressé : 12 h de jour")
        p.cliquer('button[data-jtilt="90"]')
        p.attendre("/ne se couche pas/.test(jDayTxt.textContent)", delai=5, quoi="axe couché : 24 h de jour le 21 juin")
        p.regler("jTilt", 23.4)
        p.attendre("/le jour dure 15 h/.test(jDayTxt.textContent)", delai=5, quoi="Terre réelle : environ 15 h 30 de jour")
        self.assertEqual(p.js("document.querySelector('[data-jtilt=\"23.44\"]').getAttribute('aria-pressed')"), "true")


class Fuseaux(Base):
    def etape(self, p, n):
        p.cliquer('#fSteps li[data-step="%d"] button' % n)
        time.sleep(0.8)

    def test_deux_dates_a_minuit(self):
        p = self.ouvrir("fuseaux")
        self.etape(p, 4)
        p.regler("fHour", 23.75)
        p.attendre("/^23 h 45/.test(fTime.textContent)", delai=5)
        veille = p.js("fTime.textContent.split('·')[1].trim()")
        dates = "[...fLive.querySelectorAll('i')].map(i=>i.nextSibling.textContent.trim())"
        couleurs = "[...fLive.querySelectorAll('i')].map(i=>i.style.background).join('|')"
        avant, teintes = p.js(dates), p.js(couleurs)
        self.assertEqual(len(avant), 2, "deux dates dans la légende")
        self.assertEqual(avant[0], veille)
        self.assertNotEqual(avant[0], avant[1])
        p.cliquer("#fPlay")
        p.attendre("/^0 h/.test(fTime.textContent)", delai=15, quoi="minuit UTC franchi")
        p.cliquer("#fPlay")
        self.assertEqual(p.js("fTime.textContent.split('·')[1].trim()"), avant[1], "la date affichée avance à minuit")
        self.assertEqual(p.js(dates), avant, "les deux mêmes dates restent sur la carte")
        self.assertEqual(p.js(couleurs), teintes, "chaque date garde sa couleur en passant minuit")

    def test_carte_des_fuseaux_en_panne(self):
        p = self.ouvrir("fuseaux", sans=["*tz.png*"])
        self.etape(p, 3)
        p.attendre("/n'a pas pu être chargée/.test(fLive.textContent)", quoi="message quand la carte des fuseaux manque")
        p.bloquer()
        p.attendre("!/n'a pas pu être chargée/.test(fLive.textContent)&&fLive.textContent.length>20", delai=60,
                   quoi="carte chargée une fois le réseau rétabli")

    def test_appui_tactile(self):
        p = self.ouvrir("fuseaux", largeur=820, hauteur=1100, tactile=True)
        self.etape(p, 2)
        self.immobile(p)
        r = json.loads(p.js("(function(){var r=document.getElementById('gl').getBoundingClientRect();"
                            "return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()"))
        barre = "document.querySelector('.gstatus').textContent.replace(/\\s+/g,' ')"
        avant = p.js(barre)
        p.toucher(r["x"] - 90, r["y"] - 60)
        p.attendre("%s!==%s" % (barre, json.dumps(avant)), delai=5, quoi="un appui du doigt désigne un point, comme le survol")
        apres = p.js(barre)
        time.sleep(0.8)
        self.assertEqual(p.js(barre), apres, "le point désigné reste affiché après l'appui")


class Population(Base):
    LU = ("JSON.stringify({an:pYear.textContent, monde:pWorld.textContent, legende:pLegend.textContent,"
          " source:pData.textContent, note:pNote.hidden?'':pNote.textContent, bornes:[+pSlider.min,+pSlider.max]})")

    def ouvrir_population(self, **options):
        p = self.ouvrir("population", **options)
        p.attendre(INDICATEURS_PRETS, quoi="indicateurs chargés")
        p.attendre("pWorld.textContent.length>5&&pCountry.options.length>150", quoi="population et liste des pays chargées")
        return p

    def test_population(self):
        p = self.ouvrir_population()
        d = json.loads(p.js(self.LU))
        self.assertIn("milliards", d["monde"])
        self.assertEqual(d["bornes"], [1950, 2050])
        self.assertEqual(d["an"], str(time.localtime().tm_year), "la vue s'ouvre sur l'année en cours")
        p.regler("pSlider", 1950)
        p.attendre("pYear.textContent==='1950'&&/2,49\\smilliards/.test(pWorld.textContent)", delai=5)
        p.regler("pSlider", 2050)
        p.attendre("pYear.textContent==='2050'&&/projection/.test(pKind.textContent)", delai=5)

    def test_chaque_indicateur(self):
        p = self.ouvrir_population()
        vus = {}
        for cle in ("pop", "growth", "gdp", "fert", "life", "co2", "urban"):
            p.cliquer("#pInd button[data-ind=%s]" % cle)
            p.attendre("document.querySelector('#pInd button[aria-pressed=true]').dataset.ind===%s&&pLegend.textContent.length>5"
                       % json.dumps(cle), delai=10)
            time.sleep(0.3)
            d = json.loads(p.js(self.LU))
            self.assertTrue(d["legende"] and d["source"], cle)
            self.assertLess(d["bornes"][0], d["bornes"][1], cle)
            self.assertEqual(p.js(DEFAUTS), "", cle)
            vus[cle] = d
        self.assertEqual(len({d["legende"] for d in vus.values()}), len(vus), "une légende par indicateur")
        for cle in ("fert", "life", "co2", "urban"):
            self.assertIn("Our World in Data", vus[cle]["source"], cle)
            self.assertEqual(vus[cle]["bornes"][0], 1950, cle)
            self.assertLessEqual(vus[cle]["bornes"][1], time.gmtime().tm_year, cle + " : pas de projection")

    def test_pays_choisi(self):
        p = self.ouvrir_population()
        p.regler("pCountry", "NGA", "change")
        p.attendre("/Nigeria|Nigéria/.test(pLive.textContent)", delai=10)
        p.cliquer("#pInd button[data-ind=fert]")
        p.attendre("/enfants/.test(pLive.textContent)", delai=10)
        self.assertGreater(p.js("document.querySelectorAll('#pChart path, #pChart polyline, #pChart line').length"), 0)

    def test_indicateur_memorise(self):
        p = self.ouvrir_population()
        p.cliquer("#pInd button[data-ind=co2]")
        p.attendre("/CO/.test(pLegend.textContent)", delai=10)
        p.recharger()
        p.attendre("window.EarthGlobe&&document.querySelector('#pInd button[aria-pressed=true]').dataset.ind==='co2'"
                   "&&/CO/.test(pLegend.textContent)", quoi="indicateur retrouvé après rechargement")

    def test_indicateurs_en_panne(self):
        p = self.ouvrir("population", sans=["*indicateurs.json*"])
        p.attendre("pWorld.textContent.length>5")
        time.sleep(1)
        self.assertTrue(p.js("document.querySelector('#pInd button[data-ind=fert]').disabled"),
                        "sans leurs données, les boutons des indicateurs restent inactifs")
        self.assertFalse(p.js("document.querySelector('#pInd button[data-ind=pop]').disabled"))
        self.assertIn("milliards", p.js("pWorld.textContent"))


class Saisons(Base):
    LU = "JSON.stringify([mSeason.textContent,mDay.textContent,mNoon.textContent,dateOut.textContent,latOut.textContent])"

    def lire(self, p, jour, latitude):
        p.regler("date", jour)
        p.regler("lat", latitude)
        time.sleep(0.25)
        return json.loads(p.js(self.LU))

    def test_saisons_et_duree_du_jour(self):
        p = self.ouvrir("saisons", pret=False)
        p.attendre("document.getElementById('orbit').clientWidth>0&&mDay.textContent.length>3")
        ete = self.lire(p, 171, 45)
        self.assertIn("été", ete[0])
        self.assertTrue(ete[1].startswith("15 h 25"), ete[1])
        self.assertEqual(ete[3:], ["21 juin", "45° N"])
        hiver = self.lire(p, 355, 45)
        self.assertIn("hiver", hiver[0])
        self.assertTrue(hiver[1].startswith("8 h 35"), hiver[1])
        sud = self.lire(p, 355, -45)
        self.assertIn("été", sud[0])
        self.assertIn("Sud", sud[0])
        self.assertEqual(sud[1], ete[1], "le 22 décembre au sud vaut le 21 juin au nord")
        equinoxe = self.lire(p, 79, 0)
        self.assertRegex(equinoxe[1], r"^12 h 0\d")
        self.assertNotIn("été", equinoxe[0])
        self.assertNotIn("hiver", equinoxe[0])
        pole = self.lire(p, 171, 80)
        self.assertTrue(pole[1].startswith("24 h 00"), "soleil de minuit : " + pole[1])
        nuit = self.lire(p, 355, 80)
        self.assertTrue(nuit[1].startswith("0 h 00"), "nuit polaire : " + nuit[1])
        self.assertEqual(p.js(DEFAUTS), "")

    def test_dessins(self):
        p = self.ouvrir("saisons", pret=False)
        p.attendre("document.getElementById('orbit').clientWidth>0")
        time.sleep(1)
        for ident in ("orbit", "globe"):
            n = p.js("(function(){var c=document.getElementById('%s'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data,n=0;"
                     "for(var i=3;i<d.length;i+=4) if(d[i]) n++; return n})()" % ident)
            self.assertGreater(n, 2000, "le dessin #%s est vide" % ident)
        self.assertGreater(p.js("document.querySelectorAll('#chart *').length"), 5)
        self.assertGreater(p.js("document.querySelectorAll('#table tr').length"), 3)

    def test_lecture(self):
        p = self.ouvrir("saisons", pret=False)
        p.attendre("document.getElementById('orbit').clientWidth>0&&dateOut.textContent.length>3")
        p.regler("date", 10)
        avant = p.js("dateOut.textContent")
        if p.js("play.getAttribute('aria-pressed')") != "true":
            p.cliquer("#play")
        p.attendre("dateOut.textContent!==%s" % json.dumps(avant), delai=10, quoi="la date avance pendant la lecture")


# Textes dont le contraste avec le fond est sous le seuil des WCAG (4,5 ; 3 pour les grands caractères).
CONTRASTES = r"""(function(){
function rgba(s){var m=s.match(/rgba?\(([^)]+)\)/); if(!m) return [0,0,0,0]; var a=m[1].split(/[, \/]+/).map(Number); return [a[0],a[1],a[2],a.length>3?a[3]:1];}
function lum(c){var a=c.slice(0,3).map(function(v){v/=255; return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}); return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2];}
function sur(f,b){var a=f[3]; return [f[0]*a+b[0]*(1-a),f[1]*a+b[1]*(1-a),f[2]*a+b[2]*(1-a),1];}
function rapport(f,b){var x=lum(f),y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);}
function fond(el){var pile=[]; for(var e=el;e;e=e.parentElement){var b=rgba(getComputedStyle(e).backgroundColor); if(b[3]>0){pile.push(b); if(b[3]>=1) break;}}
  var c=[255,255,255,1]; for(var i=pile.length-1;i>=0;i--) c=sur(pile[i],c); return c;}
var mal=[], vue=document.querySelector('[id^=view-]:not([hidden])');
[...document.querySelectorAll('nav.site *')].concat([...vue.querySelectorAll('*')]).forEach(function(el){
  if(!el.offsetParent||el.closest('[hidden],[aria-hidden=true]')||el.disabled) return;
  var champ=el.tagName==='INPUT'&&el.type==='text', txt=[...el.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');
  if(!txt&&!champ) return;
  var cs=getComputedStyle(el), b=fond(el), f=sur(rgba(cs.color),b), px=parseFloat(cs.fontSize), seuil=px>=24||(px>=18.66&&+cs.fontWeight>=700)?3:4.5;
  if(+cs.opacity<1) f=sur([f[0],f[1],f[2],+cs.opacity],b);
  var nom=el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className.trim().split(/\s+/).join('.'):'');
  if(champ){ var r2=rapport(sur(rgba(getComputedStyle(el,'::placeholder').color),b),b); if(r2<4.5) mal.push(nom+'::placeholder '+r2.toFixed(2)); }
  if(txt&&rapport(f,b)<seuil) mal.push(nom+' '+rapport(f,b).toFixed(2)+' « '+txt.slice(0,30)+' »');
});
return [...new Set(mal)].join(' | ');})()"""

# Boutons, liens, champs et images sans nom pour un lecteur d'écran.
SANS_NOM = r"""(function(){
var vue=document.querySelector('[id^=view-]:not([hidden])'), mal=[];
function nom(el){
  var n=el.getAttribute('aria-label')||''; var ids=el.getAttribute('aria-labelledby');
  if(ids) n+=ids.split(/\s+/).map(i=>(document.getElementById(i)||{}).textContent||'').join(' ');
  if(el.labels&&el.labels.length) n+=[...el.labels].map(l=>l.textContent).join(' ');
  if(!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) n+=el.textContent;
  return n.trim()||(el.getAttribute('title')||'').trim();
}
[...document.querySelectorAll('nav.site *')].concat([...vue.querySelectorAll('*')]).forEach(function(el){
  if(el.closest('[hidden],[aria-hidden=true]')) return;
  var role=el.getAttribute('role'), actif=/^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName)||el.tabIndex>=0&&el.hasAttribute('tabindex');
  var image=el.tagName==='CANVAS'||el.tagName==='IMG'||role==='img'||(el.tagName==='svg'&&!el.closest('button,a'));
  if((actif||image)&&!nom(el)) mal.push(el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className?'.'+el.className:''));
  if(el.tagName==='CANVAS'&&!role) mal.push('canvas#'+el.id+' sans rôle');
});
return [...new Set(mal)].join(' | ');})()"""


class Accessibilite(Base):
    def test_contrastes(self):
        for sombre in (False, True):
            p = self.ouvrir(pret=False)
            p.theme(sombre)
            p.recharger()
            p.attendre(PRET)
            for v in VUES:
                self.vue(p, v)
                if v == "globe":
                    p.cliquer("#gLayers")
                    time.sleep(0.2)
                self.assertEqual(p.js(CONTRASTES), "", "vue %s, thème %s" % (v, "sombre" if sombre else "clair"))

    def test_tout_a_un_nom(self):
        p = self.ouvrir()
        for langue in ("fr", "en"):
            p.cliquer("#lang-" + langue)
            for v in VUES:
                self.vue(p, v)
                self.assertEqual(p.js(SANS_NOM), "", "vue %s (%s)" % (v, langue))

    def test_un_titre_par_vue_et_focus(self):
        """Au changement de vue, le focus va au titre de la vue : un lecteur d'écran l'annonce."""
        p = self.ouvrir()
        for v in VUES[1:] + VUES[:1]:
            self.vue(p, v)
            self.assertEqual(p.js("document.querySelectorAll('#view-%s h1').length" % v), 1)
            self.assertEqual(p.js("document.activeElement.tagName+' '+document.activeElement.closest('[id^=view-]').id"), "H1 view-" + v)
            self.assertEqual(p.js("document.querySelectorAll('main:not([hidden])').length"), 1)
        p.js("history.back()")
        p.attendre("Site.view==='saisons'&&document.activeElement.tagName==='H1'", delai=5, quoi="« Retour » déplace aussi le focus")

    def test_pas_d_annonce_pendant_la_lecture(self):
        p = self.ouvrir("population")
        p.attendre(INDICATEURS_PRETS)
        self.assertEqual(p.js("pLive.getAttribute('aria-live')"), "polite")
        p.cliquer("#pPlay")
        p.attendre("pLive.getAttribute('aria-live')==='off'", delai=5, quoi="années qui défilent : pas d'annonce")
        p.cliquer("#pPlay")
        p.attendre("pLive.getAttribute('aria-live')==='polite'", delai=5)
        self.vue(p, "saisons")
        self.assertEqual(p.js("story.getAttribute('aria-live')"), "polite")
        p.cliquer("#play")
        self.assertEqual(p.js("story.getAttribute('aria-live')"), "off")
        p.regler("date", 100)                # déplacer le curseur arrête la lecture
        p.attendre("story.getAttribute('aria-live')==='polite'", delai=5)

    def test_mesure_au_clavier(self):
        p = self.ouvrir()
        p.js("gMeasure.focus()")
        p.touche("Enter")
        p.attendre("document.activeElement.id==='gl'&&!gMsg.hidden", delai=5, quoi="le focus passe au globe")
        self.assertIn("Entrée", p.js("gMsg.textContent"))
        self.assertGreaterEqual(p.js("parseFloat(getComputedStyle(gl).outlineWidth)"), 2, "le globe montre qu'il a le focus")
        self.assertEqual(p.js("getComputedStyle(gl).outlineStyle"), "solid")
        premier = p.js("gMsg.textContent")
        p.touche("Enter")
        p.attendre("gMsg.textContent!==%s" % json.dumps(premier), delai=5, quoi="premier point posé")
        for _ in range(3):
            p.touche("ArrowLeft")
        self.immobile(p)
        p.touche("Enter")
        p.attendre("/\\d km/.test(gMsg.textContent)", delai=5, quoi="distance affichée après le deuxième point")
        km = float(p.js("gMsg.querySelector('b').textContent.replace(/[^0-9,]/g,'').replace(',','.')"))
        self.assertGreater(km, 500)
        p.touche("Escape")
        p.attendre("gMsg.hidden&&gMeasure.getAttribute('aria-pressed')==='false'", delai=5)

    def test_mesure_a_la_souris_inchangee(self):
        p = self.ouvrir()
        p.clic_souris("#gMeasure")
        p.attendre("!gMsg.hidden", delai=5)
        self.assertIn("Cliquez", p.js("gMsg.textContent"))
        self.assertNotEqual(p.js("document.activeElement.id"), "gl", "à la souris, le focus ne quitte pas le bouton")
        p.clic_souris("#gl")
        p.attendre("/deuxième/.test(gMsg.textContent)", delai=5)
        self.assertIn("Cliquez", p.js("gMsg.textContent"))


class EcranEtroit(Base):
    def test_pas_de_defilement_horizontal(self):
        for largeur in (360, 768):
            p = self.ouvrir(largeur=largeur, hauteur=800, tactile=True)
            for langue in ("fr", "en"):
                p.cliquer("#lang-" + langue)
                for v in VUES:
                    self.vue(p, v)
                    trop = p.js("document.documentElement.scrollWidth-window.innerWidth")
                    self.assertLessEqual(trop, 0, "vue %s (%s) à %d px : déborde de %d px" % (v, langue, largeur, trop))

    def test_boutons_assez_grands_au_doigt(self):
        p = self.ouvrir(largeur=390, hauteur=800, tactile=True)
        def petits(selecteur, mini):
            return p.js("[...document.querySelectorAll(%s)].filter(e=>e.offsetParent&&(e.getBoundingClientRect().height<%s"
                        "||e.getBoundingClientRect().width<%s)).map(e=>e.id||e.textContent).join(' | ')" % (json.dumps(selecteur), mini - 0.5, mini - 0.5))

        self.assertEqual(petits(".tabs a, #view-globe .gpanel button, #fPlay, #jPlay, #pPlay, #pInd button", 40), "", "moins de 40 px")
        self.assertEqual(petits(".langs button, .gtools button", 36), "", "outils du globe et choix de la langue : moins de 36 px")


if __name__ == "__main__":
    unittest.main()
