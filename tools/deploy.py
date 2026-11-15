#!/usr/bin/env python3
"""Installe ou met à jour le site dans un dossier servi par un serveur web.

    python3 tools/deploy.py <dossier> [--back-url URL --back-fr TEXTE --back-en TEXTE]

Le dossier reçoit la page complète (index.html avec l'enveloppe que la publication en artefact ajoute d'habitude),
globe.js, data/, tiles/, fonts/ et LICENSE. Seuls les fichiers qui ont changé sont réécrits, chacun d'un seul coup :
le site reste utilisable pendant la mise à jour. Rien n'est supprimé dans le dossier.

--back-url ajoute en haut de la page un lien de retour vers le site qui l'héberge. Dans l'adresse, {lang} est remplacé
par la langue affichée (fr ou en) ; --back-fr et --back-en donnent le texte du lien dans chaque langue.

Les deux fichiers de données mis à jour par ailleurs (data/population.json, data/indicateurs.json) ne sont remplacés
que si la copie du dépôt est plus récente que celle du dossier : voir tools/update_population.py et
tools/update_indicators.py, qui acceptent --out <dossier> pour rafraîchir directement le site installé.
"""
import argparse, filecmp, hashlib, json, os, shutil, sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from serve import HEAD, TAIL  # la même enveloppe que le serveur local

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FICHIERS = ["globe.js", "LICENSE"]
DOSSIERS = ["data", "tiles", "fonts"]
DATES = ["data/population.json", "data/indicateurs.json"]     # gardés s'ils sont plus récents dans le dossier

BACK = """
<style>
.pfk-back{align-self:flex-start;margin-bottom:-12px;color:var(--ink-2);font-size:.875rem;text-decoration:none;text-underline-offset:3px}
.pfk-back:hover,.pfk-back:focus-visible{color:var(--ink);text-decoration:underline}
.pfk-back:focus-visible{outline:2px solid var(--sun);outline-offset:2px;border-radius:2px}
</style>
<script>
/* Lien de retour vers le site hôte, dans la langue choisie sur la page. */
(function(){
  var page=document.getElementById('page')||document.body, a=document.createElement('a'), S=window.Site, C=%s;
  a.className='pfk-back';
  function langue(l){ var en=l==='en'; a.textContent=en?C.en:C.fr; a.href=C.url.replace('{lang}',en?'en':'fr'); }
  langue(S&&S.lang||document.documentElement.lang);
  if(S&&S.onLang) S.onLang(langue);
  page.insertBefore(a,page.firstChild);
})();
</script>"""


def version(path):
    try:
        with open(path, encoding="utf-8") as f:
            return datetime.fromisoformat(json.load(f)["version"])
    except Exception:
        return None


def ecrire(dest, data):
    """Écrit data dans dest s'il diffère ; renvoie True si le fichier a changé."""
    if os.path.exists(dest):
        with open(dest, "rb") as f:
            if f.read() == data:
                return False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest + ".part", "wb") as f:
        f.write(data)
    os.replace(dest + ".part", dest)
    return True


def copier(rel, out):
    src, dest = os.path.join(ROOT, rel), os.path.join(out, rel)
    if os.path.exists(dest):
        if filecmp.cmp(src, dest, shallow=False):
            return False
        if rel in DATES:
            a, b = version(src), version(dest)
            if a and b and b >= a:
                print("gardé (plus récent sur place) :", rel)
                return False
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.copyfile(src, dest + ".part")
    os.replace(dest + ".part", dest)
    return True


def main():
    ap = argparse.ArgumentParser(description="Installe ou met à jour le site dans un dossier servi par un serveur web.")
    ap.add_argument("dossier")
    ap.add_argument("--back-url")
    ap.add_argument("--back-fr")
    ap.add_argument("--back-en")
    a = ap.parse_args()
    back = [a.back_url, a.back_fr, a.back_en]
    if any(back) and not all(back):
        ap.error("--back-url, --back-fr et --back-en vont ensemble.")
    out = os.path.abspath(a.dossier)
    if out == ROOT or out.startswith(ROOT + os.sep):
        ap.error("le dossier de destination doit être hors du dépôt.")

    changes = []
    for rel in FICHIERS:
        if copier(rel, out):
            changes.append(rel)
    for d in DOSSIERS:
        for base, _, noms in os.walk(os.path.join(ROOT, d)):
            for n in sorted(noms):
                rel = os.path.relpath(os.path.join(base, n), ROOT).replace(os.sep, "/")
                if copier(rel, out):
                    changes.append(rel)

    # La page : enveloppe, globe.js marqué de son empreinte (le navigateur ne garde pas l'ancien), lien de retour.
    with open(os.path.join(ROOT, "index.html"), encoding="utf-8") as f:
        page = f.read()
    with open(os.path.join(ROOT, "globe.js"), "rb") as f:
        empreinte = hashlib.sha256(f.read()).hexdigest()[:10]
    tag = '<script src="globe.js"></script>'
    if page.count(tag) != 1:
        sys.exit("index.html : balise %s introuvable." % tag)
    page = page.replace(tag, '<script src="globe.js?v=%s"></script>' % empreinte)
    extra = ""
    if all(back):
        conf = json.dumps({"url": a.back_url, "fr": a.back_fr, "en": a.back_en}, ensure_ascii=False).replace("</", "<\\/")
        extra = BACK % conf
    if ecrire(os.path.join(out, "index.html"), (HEAD + page + extra + TAIL).encode("utf-8")):
        changes.append("index.html")

    if not changes:
        print("Déjà à jour :", out)
    elif len(changes) > 12:
        print("%d fichiers mis à jour dans %s" % (len(changes), out))
    else:
        print("Mis à jour dans %s : %s" % (out, ", ".join(changes)))


if __name__ == "__main__":
    main()
