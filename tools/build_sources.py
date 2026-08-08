#!/usr/bin/env python3
"""Récolte la provenance fine des sources : quel fichier, quelle page.

Le site nommait ses sources sans y conduire précisément : « COR, rapport 2026 »
menait à une page portant une vingtaine de fichiers, à charge pour le lecteur de
deviner lequel puis d'y retrouver la figure. Ce script produit les deux tables
qui permettent d'aller droit au but :

  - `fichiers` : pour chaque rapport cité, l'URL officielle de chacun de ses
    fichiers (classeurs Excel, rapport intégral, synthèse), rangés sous un
    « rôle » stable (`donnees-p2`, `rapport`, `synthese`…). Une table récoltée
    est indispensable : les noms de fichiers du COR dérivent chaque année —
    séparateur, casse, ordre des mots, et jusqu'au codet du tiret (le classeur
    « Données juin 2026 – synthèse.xlsx » prend un cadratin quand ses voisins
    « partie 1..4 » prennent un trait d'union). Aucune interpolation ne tient.

  - `pages` : pour chaque rapport, la page où commence chaque figure ou tableau,
    lue dans le PDF. De quoi transformer « (Fig 2.11) » en un lien qui ouvre la
    bonne page.

POURQUOI LE PDF OFFICIEL, ET PAS LA COPIE ARCHIVÉE
Le COR republie ses rapports sans prévenir : au 8 août 2026, le PDF en ligne du
rapport 2026 compte 260 pages là où la copie archivée du dépôt en compte 262 —
les figures y sont décalées de deux pages. Un numéro de page faux est pire que
pas de numéro : il envoie le lecteur sur la mauvaise figure et ruine la
confiance, qui est tout le propos du site. Les pages sont donc TOUJOURS lues sur
le PDF que l'on met en lien. Le script signale au passage les rapports dont
l'archive a divergé de l'officiel.

Les chiffres affichés, eux, viennent des classeurs Excel — vérifiés identiques
entre l'archive et le site du COR.

Lancement :  python3 tools/build_sources.py
Dépendances :  requests, pypdf
Sortie :  data/cor-sources.generated.js  (window.COR_SOURCES)
"""
import hashlib
import glob
import html as html_mod
import json
import os
import re
import sys

import requests
import pypdf

from cor_files import fold, role_of

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
ARCHIVE = os.path.join(ROOT, "data", "Données du COR")
DEST = os.path.join(ROOT, "data", "cor-sources.generated.js")
CACHE = os.path.join(ROOT, ".cache-sources")
BASE = "https://www.cor-retraites.fr"

# Identifiant du registre (data/data.js) -> (préfixe du dossier d'archive,
# slug de la page officielle). Seuls les rapports RÉELLEMENT cités par le site
# figurent ici : inutile d'indexer les 31, les phrases de source n'en nomment
# que quatorze.
REPORTS = {
    "cor-2026": ("2026-06", "rapport-annuel-cor-juin-2026-evolutions-perspectives-retraites-france"),
    "cor-droits-familiaux-2025": ("2025-11", "droits-familiaux-conjugaux"),
    "cor-2025": ("2025-06", "rapport-annuel-cor-juin-2025-evolutions-perspectives-retraites-france"),
    "cor-2024": ("2024-06", "rapport-annuel-cor-juin-2024-evolutions-perspectives-retraites-france"),
    "cor-2023": ("2023-06", "rapport-annuel-cor-juin-2023-evolutions-perspectives-retraites-france"),
    "cor-2022": ("2022-09", "rapport-annuel-cor-septembre-2022-evolutions-perspectives-retraites-france"),
    "cor-2021": ("2021-06", "rapport-annuel-cor-juin-2021-evolutions-perspectives-retraites-france"),
    "cor-panorama-2020": ("2020-12", "panorama-systemes-retraite-france-a-letranger"),
    "cor-2020": ("2020-11", "rapport-annuel-cor-novembre-2020-evolutions-perspectives-retraites-france"),
    "cor-2019": ("2019-06", "rapport-cor-2019-evolutions-perspectives-retraites-france"),
    "cor-2018": ("2018-06", "rapport-cor-2018-evolutions-perspectives-retraites-france"),
    "cor-thematique-2017": ("2017-11", "rapport-thematique-novembre-2017-retraites-perspectives-financieres-jusquen-2070"),
    "cor-2017": ("2017-06", "rapport-cor-2017-evolutions-perspectives-retraites-france"),
    "cor-2016": ("2016-06", "rapport-cor-2016-evolutions-perspectives-retraites-france"),
}


def fetch(url, binary=False):
    """Télécharge, avec un cache disque : le script se relance sans repayer les
    ~60 Mo de PDF à chaque itération."""
    key = hashlib.sha256(url.encode()).hexdigest()[:16]
    path = os.path.join(CACHE, key + (".bin" if binary else ".txt"))
    if os.path.exists(path):
        return open(path, "rb").read() if binary else open(path, encoding="utf-8").read()
    os.makedirs(CACHE, exist_ok=True)
    r = requests.get(url, timeout=180)
    r.raise_for_status()
    if binary:
        open(path, "wb").write(r.content)
        return r.content
    open(path, "w", encoding="utf-8").write(r.text)
    return r.text


ANCHOR = re.compile(r'href="(/sites/default/files/[^"]+\.(pdf|xlsx|xls|pptx))"[^>]*>(.*?)</a>',
                    re.S | re.I)


def harvest(report_id, slug):
    """Fichiers publiés sur la page officielle d'un rapport, par rôle."""
    html = fetch(BASE + "/rapports-du-cor/" + slug)
    out = {}
    for m in ANCHOR.finditer(html):
        href, ext, raw = m.group(1), m.group(2), m.group(3)
        label = html_mod.unescape(re.sub(r"<[^>]+>", " ", raw))
        label = re.sub(r"\s+", " ", label).strip()
        if not label:
            continue
        role = role_of(label, ext.lower())
        if not role:
            continue
        # Premier gagnant : les pages listent parfois deux fois le même fichier
        # (vignette puis lien texte), et l'ordre du HTML suit celui de la page.
        out.setdefault(role, {"nom": label, "url": BASE + href})
    return out


FIG_IN_PDF = re.compile(r"\b(Figure|Tableau|Graphique)\s+(\d+(?:\.\d+)?(?:\.[A-Z])?)", re.I)


def fig_key(kind, num):
    """Clé canonique commune au PDF (« Figure 2.11 ») et aux onglets Excel
    (« Fig 2.11 », « Tab 2.5 », « Tableau_4 »)."""
    k = "tab" if fold(kind).startswith("tab") else "fig"
    return k + ":" + num.upper()


def index_pages(pdf_bytes):
    """Figure/tableau -> page de sa PREMIÈRE occurrence.

    La première occurrence est la figure elle-même ; les suivantes sont la table
    des figures en fin de volume (dans le rapport 2026, pages 257-261).
    """
    import io
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    pages = {}
    for i, page in enumerate(reader.pages, 1):
        try:
            text = page.extract_text() or ""
        except Exception:
            continue
        for m in FIG_IN_PDF.finditer(text):
            pages.setdefault(fig_key(m.group(1), m.group(2)), i)
    return pages, len(reader.pages)


def archived_pdf(folder_prefix):
    """Copie archivée du rapport intégral, pour la comparaison de version."""
    folders = glob.glob(os.path.join(ARCHIVE, folder_prefix + "*"))
    if not folders:
        return None
    best = None
    for p in sorted(glob.glob(os.path.join(folders[0], "*.pdf"))):
        if role_of(os.path.basename(p), "pdf") == "rapport":
            # Le plus gros PDF « rapport » est le rapport intégral.
            if best is None or os.path.getsize(p) > os.path.getsize(best):
                best = p
    return best


def write_js(dest, varname, obj):
    """Même forme que tools/extract_cor.py : `window.X = JSON.parse("…")`,
    plus rapide à analyser et plus léger qu'un littéral objet."""
    compact = json.dumps(obj, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    with open(dest, "w", encoding="utf-8") as f:
        f.write("/* FICHIER GÉNÉRÉ — ne pas éditer à la main.\n")
        f.write("   Fichiers et pages des rapports du COR (cor-retraites.fr).\n")
        f.write("   Régénérer avec : python3 tools/build_sources.py */\n")
        f.write("window.%s = JSON.parse(" % varname)
        f.write(json.dumps(compact, ensure_ascii=False))
        f.write(");\n")


def main():
    fichiers, pages, divergences = {}, {}, []

    for rid, (folder_prefix, slug) in REPORTS.items():
        files = harvest(rid, slug)
        if not files:
            print("  ! %-26s aucun fichier récolté" % rid, file=sys.stderr)
            continue
        fichiers[rid] = files
        print("  %-26s %2d fichiers" % (rid, len(files)), end="")

        rapport = files.get("rapport")
        if not rapport:
            print("  (pas de rapport intégral)")
            continue

        pdf = fetch(rapport["url"], binary=True)
        idx, n_pages = index_pages(pdf)
        if idx:
            pages[rid] = idx
        print("  %3d pages, %3d figures" % (n_pages, len(idx)))

        # Le COR republie ses rapports sans prévenir. On le dit plutôt que de
        # laisser l'archive prétendre en silence conserver le document officiel.
        local = archived_pdf(folder_prefix)
        if local:
            same = hashlib.md5(open(local, "rb").read()).digest() == hashlib.md5(pdf).digest()
            if not same:
                n_local = len(pypdf.PdfReader(local).pages)
                divergences.append((rid, os.path.basename(local), n_local, n_pages))

    write_js(DEST, "COR_SOURCES", {"fichiers": fichiers, "pages": pages})
    total_files = sum(len(v) for v in fichiers.values())
    total_pages = sum(len(v) for v in pages.values())
    print("\n%s — %d rapports, %d fichiers, %d repères de page." %
          (os.path.relpath(DEST, ROOT), len(fichiers), total_files, total_pages))

    if divergences:
        print("\nATTENTION — le PDF officiel diffère de la copie archivée :", file=sys.stderr)
        for rid, name, n_local, n_off in divergences:
            print("  %-26s archive %d p. / officiel %d p.  (%s)" %
                  (rid, n_local, n_off, name), file=sys.stderr)
        print("  Les pages ci-dessus sont celles du PDF OFFICIEL, celui qui est mis\n"
              "  en lien. Rafraîchir l'archive est un autre sujet.", file=sys.stderr)


if __name__ == "__main__":
    main()
