#!/usr/bin/env python3
"""Vocabulaire commun des fichiers du COR : le « rôle » d'un fichier.

Deux scripts doivent désigner le même fichier sous le même nom :

  - `tools/build_sources.py` récolte, sur le site du COR, l'URL de chaque
    fichier publié — à partir de son libellé de lien ;
  - `tools/extract_cor.py` lit les chiffres dans la copie archivée de ces mêmes
    fichiers — à partir de leur nom sur le disque.

Sans vocabulaire commun, impossible de relier le chiffre affiché au fichier
téléchargeable. Un gabarit d'URL ne suffirait pas : les noms du COR dérivent
chaque année (séparateur, casse, ordre des mots, et jusqu'au codet du tiret —
« Données juin 2026 – synthèse.xlsx » prend un cadratin quand ses voisins
« partie 1..4 » prennent un trait d'union). D'où cette normalisation, appliquée
des deux côtés, qui ramène ces variantes à un rôle stable : `donnees-p2`,
`rapport`, `synthese`…
"""
import re
import unicodedata

# Millésime employé par tools/extract_cor.py -> identifiant du registre de
# data/data.js. Les clés à quatre chiffres sont les rapports annuels ; les
# autres sont les rapports thématiques, désignés par leur mois de parution.
VINTAGE_TO_REPORT = {
    "2016": "cor-2016", "2017": "cor-2017", "2018": "cor-2018", "2019": "cor-2019",
    "2020": "cor-2020", "2021": "cor-2021", "2022": "cor-2022", "2023": "cor-2023",
    "2024": "cor-2024", "2025": "cor-2025", "2026": "cor-2026",
    "2016-06": "cor-2016", "2017-06": "cor-2017", "2018-06": "cor-2018",
    "2019-06": "cor-2019", "2020-11": "cor-2020", "2021-06": "cor-2021",
    "2022-09": "cor-2022", "2023-06": "cor-2023", "2024-06": "cor-2024",
    "2025-06": "cor-2025", "2026-06": "cor-2026",
    "2025-11": "cor-droits-familiaux-2025", "2020-12": "cor-panorama-2020",
    "2017-11": "cor-thematique-2017",
}

ROMAN = {"i": "1", "ii": "2", "iii": "3", "iv": "4", "v": "5"}


def fold(s):
    """Minuscule sans accents — les libellés du COR changent de casse d'une
    année à l'autre (« Partie 1 » / « partie 1 », « Contexte » / « contexte »)."""
    s = unicodedata.normalize("NFD", s)
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def role_of(label, ext):
    """Libellé ou nom de fichier -> rôle stable, ou None si ce fichier n'est pas
    une source de données.

    Sont écartés les diaporamas, communiqués de presse et traductions : ils
    reprennent les chiffres du rapport, ils ne les établissent pas. Y renvoyer
    le lecteur serait le renvoyer à une source de seconde main.
    """
    s = fold(label)
    s = re.sub(r"\.(xlsx|xls|pdf|pptx)$", "", s).strip()

    if ext in ("xlsx", "xls"):
        m = re.search(r"\bpartie\s+(\d+|[iv]+)\b", s)
        if m:
            n = m.group(1)
            return "donnees-p" + ROMAN.get(n, n)
        if "annexe methodologique" in s:
            return "donnees-annexe-methodo"
        if "synthese" in s:
            return "donnees-synthese"
        if "annexe" in s:
            return "donnees-annexes"
        if "complementaire" in s:
            return "donnees-complementaires"
        if "complements disparites" in s:
            return "donnees-disparites"
        if "contexte" in s:
            return "donnees-contexte"
        if "indicateurs financiers" in s:
            return "donnees-indicateurs"
        if "resultats" in s:
            return "donnees-resultats"
        if "fiches-pays" in s or "fiches pays" in s:
            return "donnees-fiches-pays"
        if "thematique" in s:
            return "donnees-thematique"
        if "introduction" in s:
            return "donnees-introduction"
        if "etranger" in s:
            return "donnees-etranger"
        if s.startswith("hypotheses"):
            return "donnees-" + re.sub(r"[^a-z0-9]+", "-", s).strip("-")
        return "donnees"

    if ext == "pdf":
        if re.search(r"diaporama|presentation|point presse|communique|summary|dossier de presse", s):
            return None
        if "annexe methodologique" in s:
            return "annexe-methodo"
        if "synthese" in s:
            return "synthese"
        # Le rapport intégral porte cinq conventions de nom selon l'année :
        # « Rapport annuel du COR - juin 2026 », « 10ème rapport du COR »,
        # « 14e rapport du COR », « Panorama … », « Droits familiaux … ».
        if re.search(r"\brapport\b|\bpanorama\b|droits familiaux", s) and "chap" not in s:
            return "rapport"
        return None

    return None


def sheet_to_key(sheet):
    """Nom d'onglet Excel -> clé de figure canonique, ou None.

    Les classeurs du COR nomment leurs onglets d'après la figure du rapport
    (« Fig 2.11 », « Tab 2.5 », « Tableau_4 ») ; le PDF, lui, écrit « Figure
    2.11 » ou « Tableau 2.5 ». Cette clé réconcilie les deux, et permet donc de
    passer de l'onglet à la page. Renvoie None pour les onglets qui ne portent
    pas de numéro (« Âge conjoncturel », « Dépenses en % »…) : ceux-là n'auront
    pas de renvoi de page, et c'est très bien — mieux vaut pas de page qu'une
    page devinée.
    """
    m = re.match(r"\s*(fig|tab|tableau|graphique)\.?[\s_.]*(\d+(?:\.\d+)?(?:\.[A-Za-z])?)\s*$",
                 sheet, re.I)
    if not m:
        return None
    kind = "tab" if fold(m.group(1)).startswith("tab") else "fig"
    return kind + ":" + m.group(2).upper()
