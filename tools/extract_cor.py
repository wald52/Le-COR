#!/usr/bin/env python3
"""Extraction reproductible des séries du COR depuis les fichiers Excel.

Lit les fichiers Excel officiels rangés sous `data/Données du COR/` et génère
`data/cor-series.generated.js` (window.COR_SERIES), consommé par le site.

But : remplacer les valeurs d'amorçage par les CHIFFRES OFFICIELS, de façon
traçable (réexécuter ce script régénère les données).

Lancement :  python3 tools/extract_cor.py
Dépendance :  openpyxl
"""
import glob, os, json, types, openpyxl
from openpyxl.worksheet import print_settings

# Certains classeurs du COR (ex. partie 3 de juin 2026) contiennent une zone
# d'impression invalide (« #N/A ») qu'openpyxl refuse : on la tolère.
_orig_print_titles = print_settings.PrintTitles.from_string.__func__


def _safe_print_titles(cls, value):
    try:
        return _orig_print_titles(cls, value)
    except Exception:
        return types.SimpleNamespace(rows=None, cols=None)


print_settings.PrintTitles.from_string = classmethod(_safe_print_titles)

BASE = os.path.join(os.path.dirname(__file__), "..", "data", "Données du COR")

# Millésime -> (préfixe dossier, motif de fichier, productivité de référence du
# scénario à tracer). Pour 2024/2025, la synthèse ne contient que le scénario
# de référence (ligne « Sc. Ref »), d'où prod_ref = None.
VINTAGES = [
    ("2016", "2016-06", "Indicateurs financiers", 0.013),
    ("2017", "2017-06", "Indicateurs financiers", 0.013),
    ("2018", "2018-06", "indicateurs financiers", 0.013),
    ("2019", "2019-06", "Partie 2", 0.013),
    ("2020", "2020-11", "Partie 2", 0.013),
    ("2021", "2021-06", "Partie 2", 0.013),
    ("2022", "2022-09", "septembre 2022 - partie 2", 0.013),
    ("2023", "2023-06", "synthèse", 0.010),
    ("2024", "2024-06", "synthèse", None),
    ("2025", "2025-06", "synthèse", None),
    ("2026", "2026-06", "synthèse", None),
]

# Millésime le plus récent : sert de série « réalisé » et de base à
# l'explorateur d'indicateurs.
LATEST = "2026"

# Productivité de référence affichée dans la légende (en %).
PROD_LABEL = {"2016": "1,3", "2017": "1,3", "2018": "1,3", "2019": "1,3",
              "2020": "1,3", "2021": "1,3", "2022": "1,3", "2023": "1,0",
              "2024": "1,0", "2025": "0,7", "2026": "0,7"}

# Couleur par millésime : dégradé gris → bleu → vert → orange → rouge,
# pour lire visuellement l'écoulement du temps (2026 = le plus saillant).
COLORS = {"2016": "#9aa7b4", "2017": "#7d8ca0", "2018": "#5b6f93",
          "2019": "#3f7cb0", "2020": "#2ca089", "2021": "#6aa84f",
          "2022": "#e0a800", "2023": "#e8731c", "2024": "#d6452a",
          "2025": "#c2185b", "2026": "#7b1fa2"}


def find_depenses_block(wb):
    """Localise le bloc de données « Dépenses, en % du PIB » / ligne 'Obs'."""
    for ws in wb.worksheets:
        rows = list(ws.iter_rows(values_only=True))
        for i, r in enumerate(rows):
            if len(r) > 2 and r[1] == "Dépenses, en % du PIB" and r[2] == "Obs":
                return rows, i
    return None, None


def year_cols(rows):
    for r in rows[:8]:
        if any(isinstance(c, int) and 1990 <= c <= 2100 for c in r):
            return {i: c for i, c in enumerate(r)
                    if isinstance(c, int) and 1990 <= c <= 2100}
    return {}


def to_series(row, ycols):
    """Convertit une ligne en {année: valeur en %} (les parts sont en fraction)."""
    return {ycols[i]: round(row[i] * 100, 3)
            for i in ycols if i < len(row) and isinstance(row[i], (int, float))}


def extract_depenses(path, prod_ref):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows, iobs = find_depenses_block(wb)
    if rows is None:
        wb.close()
        return None
    ycols = year_cols(rows)
    observed = to_series(rows[iobs], ycols)
    projection = {}
    # La projection de référence est dans l'une des ~7 lignes suivant l'observé.
    for r in rows[iobs + 1:iobs + 8]:
        c2 = r[2] if len(r) > 2 else None
        if c2 == "Sc. Ref":
            projection = to_series(r, ycols)
            break
        if prod_ref is not None and isinstance(c2, (int, float)) \
                and abs(float(c2) - prod_ref) < 1e-4:
            projection = to_series(r, ycols)
            break
    wb.close()
    return {"observed": observed, "projection": projection}


def first_file(folder_prefix, name_substr):
    folders = glob.glob(os.path.join(BASE, folder_prefix + "*"))
    if not folders:
        return None
    for p in glob.glob(os.path.join(folders[0], "*.xlsx")):
        if name_substr.lower() in os.path.basename(p).lower():
            return p
    return None


# --------------------------------------------------------------------------
# Solde / Ressources — multi-millésimes (2016 → 2026)
#
# Chaque rapport publie le solde et les ressources « observés et projetés »,
# mais la mise en page varie selon l'époque :
#   - mode "sdr"   (2023+)      : feuille de synthèse, lignes Dépenses /
#                                 Ressources / Solde (convention EPR) ;
#   - mode "conv"  (2020-2022)  : figure avec une ligne « Observé » puis un
#                                 bloc par convention comptable (EEC/TCC/EPR),
#                                 une ligne par scénario de productivité ;
#   - mode "title" (2016-2019)  : figure avec un bloc « libellé | Obs » puis
#                                 une ligne par scénario (convention « COR »).
# On retient le scénario de productivité du tableau VINTAGES (1,3 % avant
# 2023) et la convention EPR dès qu'elle existe, « COR » avant 2020.
# --------------------------------------------------------------------------
SOLDE_SOURCES = [
    ("2016", "2016-06", "Indicateurs financiers", "title", ("solde financier", "projeté"), 0.013, "conv. COR"),
    ("2017", "2017-06", "Indicateurs financiers", "title", ("solde financier", "projeté"), 0.013, "conv. COR"),
    ("2018", "2018-06", "indicateurs financiers", "title", ("solde financier", "projeté"), 0.013, "conv. COR"),
    ("2019", "2019-06", "Partie 2", "title", ("solde financier annuel observé",), 0.013, "conv. COR"),
    ("2020", "2020-11", "Partie 2", "conv", ("solde financier observé et projeté",), 0.013, "conv. EPR"),
    ("2021", "2021-06", "Partie 2", "conv", ("solde observé et projeté",), 0.013, "conv. EPR"),
    ("2022", "2022-09", "septembre 2022 - partie 2", "conv", ("solde observé et projeté",), 0.013, "conv. EPR"),
    ("2023", "2023-06", "synthèse", "sdr", ("Solde_dép_ress", "Solde"), None, "conv. EPR"),
    ("2024", "2024-06", "synthèse", "sdr", ("Solde dépenses ressources", "Solde"), None, "conv. EPR"),
    ("2025", "2025-06", "synthèse", "sdr", ("Solde dépenses ressources", "Solde"), None, "conv. EPR"),
    ("2026", "2026-06", "synthèse", "sdr", ("Solde dépenses ressources", "Solde"), None, "conv. EPR"),
]
RESSOURCES_SOURCES = [
    ("2016", "2016-06", "Indicateurs financiers", "title", ("ressources", "dépenses du système"), 0.013, "conv. COR"),
    ("2017", "2017-06", "Indicateurs financiers", "title", ("ressources", "projet"), 0.013, "conv. COR"),
    ("2018", "2018-06", "indicateurs financiers", "title", ("ressources", "observ"), 0.013, "conv. COR"),
    ("2019", "2019-06", "Partie 2", "title", ("ressources observées", "projet"), 0.013, "conv. COR"),
    ("2020", "2020-11", "Partie 2", "conv", ("ressources observées et projetées",), 0.013, "conv. EPR"),
    ("2021", "2021-06", "Partie 2", "conv", ("ressources observées et projetées",), 0.013, "conv. EPR"),
    ("2022", "2022-09", "septembre 2022 - partie 2", "conv", ("ressources observées et projetées",), 0.013, "conv. EPR"),
    ("2023", "2023-06", "synthèse", "sdr", ("Solde_dép_ress", "Ressources"), None, "conv. EPR"),
    ("2024", "2024-06", "synthèse", "sdr", ("Solde dépenses ressources", "Ressources"), None, "conv. EPR"),
    ("2025", "2025-06", "synthèse", "sdr", ("Solde dépenses ressources", "Ressources"), None, "conv. EPR"),
    ("2026", "2026-06", "synthèse", "sdr", ("Solde dépenses ressources", "Ressources"), None, "conv. EPR"),
]


def extract_sdr(path, sheet):
    """Renvoie {ligne: {année: % PIB}} pour Dépenses / Ressources / Solde."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        return None
    ws = wb[sheet]
    rows = list(ws.iter_rows(values_only=True))
    ycols = {}
    for r in rows[:6]:
        ints = {i: c for i, c in enumerate(r)
                if isinstance(c, int) and 1990 <= c <= 2100}
        if ints:
            ycols = ints
            break
    out = {}
    for r in rows:
        lbl = r[1] if len(r) > 1 else None
        if lbl in ("Dépenses", "Ressources", "Solde"):
            out[lbl] = {ycols[i]: round(r[i] * 100, 3)
                        for i in ycols if i < len(r) and isinstance(r[i], (int, float))}
    wb.close()
    return out


def _norm(s):
    return " ".join(str(s).split()).lower()


def sheet_by_title(wb, keys):
    """Première feuille dont le titre (A1) contient tous les mots-clés."""
    for ws in wb.worksheets:
        a1 = _norm(ws.cell(1, 1).value or "")
        if all(k in a1 for k in keys):
            return ws
    return None


def _sheet_ycols(rows):
    for r in rows[:8]:
        ints = {i: c for i, c in enumerate(r)
                if isinstance(c, int) and 1990 <= c <= 2100}
        if len(ints) >= 3:
            return ints
    return {}


def extract_title_block(path, keys, prod_ref):
    """Mode 2016-2019 : bloc « libellé | Obs » puis lignes-scénarios (col C)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = sheet_by_title(wb, keys)
    if ws is None:
        wb.close()
        return None
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    ycols = _sheet_ycols(rows)
    iobs = next((i for i, r in enumerate(rows)
                 if len(r) > 2 and str(r[2]).strip() == "Obs"), None)
    if iobs is None or not ycols:
        return None
    for r in rows[iobs + 1:iobs + 8]:
        c2 = r[2] if len(r) > 2 else None
        if isinstance(c2, (int, float)) and abs(float(c2) - prod_ref) < 1e-4:
            return to_series(r, ycols)
    return None


def extract_conv_block(path, keys, prod_ref, convention="EPR"):
    """Mode 2020-2022 : ligne « Observé » puis un bloc par convention comptable."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = sheet_by_title(wb, keys)
    if ws is None:
        wb.close()
        return None
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    ycols = _sheet_ycols(rows)
    if not ycols:
        return None
    iconv = next((i for i, r in enumerate(rows) if len(r) > 1 and r[1]
                  and _norm(r[1]) == _norm(f"Convention {convention}")), None)
    if iconv is None:
        return None
    for i in range(iconv, min(iconv + 6, len(rows))):
        r = rows[i]
        c1 = r[1] if len(r) > 1 else None
        if i > iconv and isinstance(c1, str) and c1.strip().lower().startswith("convention"):
            break
        c2 = r[2] if len(r) > 2 else None
        if isinstance(c2, (int, float)) and abs(float(c2) - prod_ref) < 1e-4:
            return to_series(r, ycols)
    return None


def extract_fin_multi(sources, what):
    """Projections multi-millésimes {vy: {année: % PIB}} pour solde/ressources."""
    out = {}
    for vy, dpat, fpat, mode, keys, prod, conv in sources:
        path = first_file(dpat, fpat)
        if not path:
            print(f"✗ {what} {vy} : fichier introuvable")
            continue
        if mode == "sdr":
            sdr = extract_sdr(path, keys[0])
            serie = sdr.get(keys[1]) if sdr else None
        elif mode == "conv":
            serie = extract_conv_block(path, keys, prod)
        else:
            serie = extract_title_block(path, keys, prod)
        if serie:
            out[vy] = serie
        else:
            print(f"✗ {what} {vy} : bloc {mode} introuvable {keys}")
    return out


# --------------------------------------------------------------------------
# Niveau de vie relatif et âge conjoncturel — multi-millésimes (2023 → 2026)
# (les synthèses antérieures à 2023 ne publient pas ces feuilles)
# --------------------------------------------------------------------------
NV_SOURCES = [
    ("2023", "2023-06", "Niveau_vie", 0.010),
    ("2024", "2024-06", "Niveau de vie relatif", "Scénario de référence"),
    ("2025", "2025-06", "Niveau de vie relatif", "Scénario de référence"),
    ("2026", "2026-06", "Niveau de vie relatif", "Scénario de référence"),
]
AGE_SOURCES = [
    ("2023", "2023-06", "Âge_retraite"),
    ("2024", "2024-06", "Âge conjoncturel"),
    ("2025", "2025-06", "Âge conjoncturel"),
    ("2026", "2026-06", "Âge conjoncturel"),
]


def extract_nv_vintage(path, sheet, selector):
    """Niveau de vie relatif : (observé, scénario de référence) en %.

    `selector` : libellé « Scénario de référence » (2024+) ou productivité de
    référence en fraction (2023, où les projections sont des lignes 1,6/1,3/1,0 %).
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        return None, None
    rows = list(wb[sheet].iter_rows(values_only=True))
    wb.close()
    ycols = {}
    for r in rows[:6]:
        ints = {i: c for i, c in enumerate(r) if isinstance(c, int) and 1960 <= c <= 2100}
        if ints:
            ycols = ints
            break
    obs = ref = None
    for r in rows:
        c2 = r[2] if len(r) > 2 else None
        vals = {ycols[i]: round(r[i] * 100, 1)
                for i in ycols if i < len(r) and isinstance(r[i], (int, float))}
        if c2 == "Observations":
            obs = vals
        elif isinstance(selector, str) and c2 == selector:
            ref = vals
        elif isinstance(selector, float) and isinstance(c2, (int, float)) \
                and abs(float(c2) - selector) < 1e-4:
            ref = vals
    return obs, ref


def extract_age_vintage(path, sheet):
    """Âge conjoncturel : (observé, projeté « Tous scénarios »), en années."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    cand = [s for s in wb.sheetnames if s.strip() == sheet.strip()]
    if not cand:
        wb.close()
        return None, None
    rows = list(wb[cand[0]].iter_rows(values_only=True))
    wb.close()
    return _obs_proj(rows, 1)


def labeled_row(path, sheet_keys, row_key, scale=1.0):
    """Série {année: valeur} de la 1re ligne dont le libellé contient row_key.

    Le libellé peut être en colonne A (rapports ≤ 2019) ou B (rapports
    récents) ; les années sont repérées par le premier bloc d'entiers.
    """
    if not path:
        return {}
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = sheet_by_title(wb, sheet_keys)
    if ws is None:
        wb.close()
        return {}
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    ym = _ymap(rows)
    for r in rows:
        for j in (0, 1):
            v = r[j] if len(r) > j else None
            if isinstance(v, str) and row_key.lower() in _norm(v):
                return {ym[i]: round(r[i] * scale, 3) for i in ym
                        if i < len(r) and isinstance(r[i], (int, float))}
    return {}


def extract_fecondite(path):
    """Indice de fécondité : observé (définitif + provisoire) et scénario central."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = None
    for s in wb.worksheets:
        a1 = str(s.cell(1, 1).value or "").lower()
        if "fécondit" in a1 and ("observé" in a1 or "projet" in a1):
            ws = s
            break
    if ws is None:
        wb.close()
        return None
    rows = list(ws.iter_rows(values_only=True))
    ycols = {}
    for r in rows[:6]:
        ic = {i: c for i, c in enumerate(r) if isinstance(c, int) and 1990 <= c <= 2100}
        if ic:
            ycols = ic
            break
    central, obs = {}, {}
    for r in rows:
        lbl = str(r[1]).lower() if len(r) > 1 and r[1] else ""
        vals = {ycols[i]: round(r[i], 3) for i in ycols
                if i < len(r) and isinstance(r[i], (int, float))}
        if "central" in lbl and not central:
            central = vals
        if lbl.startswith("observé") or "données provisoires" in lbl:
            obs.update(vals)
    wb.close()
    return {"observed": obs, "central": central}


def extract_productivite_obs(path):
    """Croissance annuelle observée de la productivité (Fig 1.9 / 1.10)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = None
    for s in wb.worksheets:
        a1 = str(s.cell(1, 1).value or "").lower()
        if "productivit" in a1 and "croissance" in a1:
            ws = s
            break
    if ws is None:
        wb.close()
        return None
    rows = list(ws.iter_rows(values_only=True))
    ycols = {}
    for r in rows[:6]:
        ic = {i: c for i, c in enumerate(r) if isinstance(c, int) and 1980 <= c <= 2100}
        if ic:
            ycols = ic
            break
    annual = {}
    for r in rows:
        lbl = str(r[1]).lower() if len(r) > 1 and r[1] else ""
        if lbl.startswith("croissance annuelle observ"):
            annual = {ycols[i]: r[i] * 100 for i in ycols
                      if i < len(r) and isinstance(r[i], (int, float))}
            break
    wb.close()
    return annual


def moving_average(series, window=5):
    """Moyenne mobile centrée d'un dict {année: valeur}."""
    ys = sorted(series)
    out = []
    half = window // 2
    for y in ys:
        vals = [series[k] for k in range(y - half, y + half + 1) if k in series]
        if len(vals) >= 3:
            out.append({"x": y, "y": round(sum(vals) / len(vals), 3)})
    return out


# ==========================================================================
# EXPLORATEUR D'INDICATEURS — catalogue de séries « observé + projeté »
# (un seul graphique sur le site, indicateur sélectionnable). Permet d'avoir
# « tous les indicateurs » sans empiler les graphiques.
# ==========================================================================
R26 = "2026-06"  # on s'appuie sur le rapport le plus récent
R25 = "2025-06"  # rapport précédent (certains fichiers n'existent qu'en 2025)


def _rows(filepat, sheet, vintage=R26):
    path = first_file(vintage, filepat)
    if not path:
        return None
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    cand = [s for s in wb.sheetnames if s.strip() == sheet.strip()]
    if not cand:
        wb.close()
        return None
    rows = list(wb[cand[0]].iter_rows(values_only=True))
    wb.close()
    return rows


def _ymap(rows):
    """Premier bloc contigu d'années croissantes (gère les blocs répétés côte à côte)."""
    for r in rows[:6]:
        ic = [(i, c) for i, c in enumerate(r) if isinstance(c, int) and 1950 <= c <= 2100]
        if len(ic) >= 3:
            out, last = {}, None
            for i, c in ic:
                if last is not None and c < last:
                    break
                out[i] = c
                last = c
            return out
    return {}


def _row_label(rows, key, scale=1.0):
    """Première ligne dont col1 contient `key`, mappée aux années (1er bloc)."""
    ym = _ymap(rows)
    for r in rows:
        if len(r) > 1 and r[1] and key.lower() in str(r[1]).lower():
            return {ym[i]: round(r[i] * scale, 3) for i in ym
                    if i < len(r) and isinstance(r[i], (int, float))}
    return {}


_PROJ_KEYS = ("central", "référence", "reference", "tous scénarios", "sc. ref", "projection")


def _obs_proj(rows, scale=1.0):
    """Extrait (observé, projeté) d'une figure 'observé puis projeté'."""
    ym = _ymap(rows)

    def match(r, keys):
        for j in (1, 2):
            v = str(r[j]).lower().strip() if len(r) > j and r[j] is not None else ""
            if any(k in v for k in keys):
                return True
        return False

    obs = proj = None
    for r in rows:
        if obs is None and match(r, ("observé", "obs", "observations")):
            obs = {ym[i]: round(r[i] * scale, 3) for i in ym
                   if i < len(r) and isinstance(r[i], (int, float))}
        if proj is None and match(r, _PROJ_KEYS):
            proj = {ym[i]: round(r[i] * scale, 3) for i in ym
                    if i < len(r) and isinstance(r[i], (int, float))}
    return obs or {}, proj or {}


def _block_sub(rows, label_key, sub):
    """Sous-ligne col2==sub du 1er bloc dont col1 contient label_key."""
    ym = _ymap(rows)
    start = None
    for i, r in enumerate(rows):
        if len(r) > 1 and r[1] and label_key.lower() in str(r[1]).lower():
            start = i
            break
    if start is None:
        return {}
    for r in rows[start:start + 7]:
        if len(r) > 2 and str(r[2]).strip() == sub:
            return {ym[i]: r[i] for i in ym if i < len(r) and isinstance(r[i], (int, float))}
    return {}


def _ratio(a, b, scale=1.0):
    return {y: round(a[y] / b[y] * scale, 3) for y in a if y in b and b[y]}


def _series(obs, proj, color, obs_from=2000, to=2070):
    """Construit [observé solide, projeté pointillé] filtré sur [obs_from, to]."""
    o = [{"x": y, "y": obs[y]} for y in sorted(obs) if obs_from <= y <= to]
    p = [{"x": y, "y": proj[y]} for y in sorted(proj) if obs_from <= y <= to]
    out = []
    if o:
        out.append({"label": "Observé", "color": "#1f2d3d", "kind": "solid", "points": o})
    if p:
        out.append({"label": f"Projeté (réf. {LATEST})", "color": color, "kind": "dash", "points": p})
    return out


def _bounds(series, xpad=0, ypad=0.06):
    xs = [pt["x"] for s in series for pt in s["points"]]
    ys = [pt["y"] for s in series for pt in s["points"]]
    yr = (max(ys) - min(ys)) or 1
    return {"xMin": min(xs), "xMax": max(xs),
            "yMin": round(min(ys) - yr * ypad, 2), "yMax": round(max(ys) + yr * ypad, 2)}


def build_explorer(multi=None):
    """`multi` : séries multi-millésimes calculées dans build() —
    {indicateur: ({vy: {année: val}} projections, obs {année: val})}."""
    multi = multi or {}
    ind = {}

    def add(iid, label, unit, suffix, series, desc, source, obs_from=2000):
        series = [s for s in series if s["points"]]
        if not series:
            print("✗ explorateur:", iid, "(vide)")
            return None
        b = _bounds(series)
        ind[iid] = {"label": label, "unit": unit, "suffix": suffix,
                    "desc": desc, "source": source, "series": series, **b}
        return iid

    def vintage_series(obs, projs, obs_from=2000):
        """Observé (trait plein) + une projection en pointillé par millésime."""
        out = []
        if obs:
            out.append({"label": "Observé", "color": "#1f2d3d", "kind": "solid",
                        "points": [{"x": y, "y": obs[y]} for y in sorted(obs)
                                   if obs_from <= y <= 2070]})
        for vy in sorted(projs):
            p = projs[vy]
            pts = [{"x": y, "y": p[y]} for y in sorted(p) if int(vy) <= y <= 2070]
            if pts:
                out.append({"label": f"Rapport {vy}", "color": COLORS.get(vy, "#888888"),
                            "kind": "dash", "points": pts})
        return out

    DEMO, PENS, FIN, ECO = "#2f6fb0", "#c2185b", "#e8731c", "#6aa84f"

    # --- Démographie
    r = _rows("partie 1", "Fig 1.2")
    if r:
        o, p = _obs_proj(r, 0.001)
        series = _series(o, p, DEMO, 1995)
        if "migration" in multi:
            series = vintage_series(o, multi["migration"], 1995)
        add("migration", "Solde migratoire", "milliers de personnes / an", " k",
            series,
            "Le solde migratoire (entrées − sorties). Hypothèse de +70 000/an jusqu'au "
            "rapport 2025, relevée à +150 000/an dans les projections 2026.",
            "COR / INSEE, rapports 2019-2026 (fig. 1.2 de chaque rapport).", 1995)
    r = _rows("partie 1", "Fig 1.11")
    if r:
        o, p = _obs_proj(r, 100)
        add("chomage", "Taux de chômage", "%", " %", _series(o, p, DEMO),
            "Le taux de chômage de long terme retenu est de 7,0 %.",
            "COR, rapport 2026 (fig. 1.11).")
    r = _rows("partie 1", "Fig 1.5")
    if r:
        o, p = _obs_proj(r, 1)
        add("ratio_demo", "Rapport démographique (20-64 ans / 65 ans et +)", "ratio", "",
            _series(o, p, DEMO),
            "Combien de personnes en âge de travailler pour une personne de 65 ans et plus. "
            "Il s'effondre avec le vieillissement.",
            "COR / INSEE, rapport 2026 (fig. 1.5).")
    # Les effectifs cotisants/retraités ne sont publiés que dans les « données
    # complémentaires », absentes du rapport 2026 : on garde celles de 2025.
    cr = _rows("complémentaires", "Cotisants_Retraités", R25)
    if cr:
        co, cp = _block_sub(cr, "cotisants", "Obs"), _block_sub(cr, "cotisants", "Sc. Ref")
        ro, rp = _block_sub(cr, "retraités", "Obs"), _block_sub(cr, "retraités", "Sc. Ref")
        add("cot_ret", "Nombre de cotisants par retraité", "ratio", "",
            _series(_ratio(co, ro), _ratio(cp, rp), DEMO),
            "Le cœur du système par répartition : chaque retraité est financé par les "
            "cotisations des actifs. Ce ratio baisse de ~1,8 vers ~1,4.",
            "COR, rapport 2025 (données complémentaires, non republiées en 2026).")
    fec = _rows("partie 1", "Fig 1.1")
    if fec:
        o = _row_label(fec, "Observé")
        o.update(_row_label(fec, "Données provisoires"))
        p = _row_label(fec, "central")
        series = _series(o, p, DEMO)
        if "fecondite" in multi:
            series = vintage_series(o, multi["fecondite"])
        add("fecondite", "Indice de fécondité", "enfants / femme", "",
            series,
            "Nombre d'enfants par femme. Hypothèse de 1,95 jusqu'en 2021, abaissée à "
            "1,80 en 2022 puis à 1,45 en 2026 — cette fois sous l'observé (~1,56 en 2025).",
            "COR / INSEE, rapports 2019-2026 (fig. 1.1 de chaque rapport).")
    ev = _rows("partie 1", "Fig 1.3")
    if ev:
        o = _row_label(ev, "Observé")
        p = _row_label(ev, "scénario central")
        series = _series(o, p, DEMO)
        if "esp_vie" in multi:
            series = vintage_series(o, multi["esp_vie"])
        add("esp_vie", "Espérance de vie à 65 ans (femmes)", "ans", " ans",
            series,
            "Nombre d'années encore à vivre à 65 ans (femmes). Elle progresse à chaque "
            "jeu de projections, ce qui allonge la durée de retraite.",
            "COR / INSEE, rapports 2019-2026 (espérance de vie à 65 ans, scénario central).")

    # --- Emploi & économie
    r = _rows("partie 1", "Fig 1.12")
    if r:
        o, p = _obs_proj(r, 100)
        add("emploi", "Taux d'emploi des 15-64 ans", "%", " %", _series(o, p, ECO),
            "Part des 15-64 ans qui ont un emploi. Plus il est élevé, plus il y a de "
            "cotisants.",
            "COR, rapport 2026 (fig. 1.12).")
    pr = _rows("partie 1", "Fig 1.10")
    if pr:
        annual = {}
        for r2 in pr:
            if len(r2) > 1 and str(r2[1]).lower().startswith("croissance annuelle observ"):
                ym = _ymap(pr)
                annual = {ym[i]: r2[i] * 100 for i in ym if i < len(r2) and isinstance(r2[i], (int, float))}
                break
        ma = {p["x"]: p["y"] for p in moving_average(annual, 5)}
        ref = _row_label(pr, "Scénario de référence", 100)
        s = _series(ma, ref, ECO)
        if s:
            s[0]["label"] = "Observé (moy. mobile 5 ans)"
            add("productivite", "Productivité du travail", "%/an", " %", s,
                "Croissance de la productivité : moteur des salaires donc des cotisations. "
                "L'hypothèse de référence (0,7 %) a été fortement abaissée.",
                "COR, rapport 2026 (fig. 1.10).")

    # --- Pensions & retraités
    r = _rows("synthèse", "Âge conjoncturel")
    if r:
        o, p = _obs_proj(r, 1)
        series = _series(o, p, PENS)
        if "age" in multi:
            series = vintage_series(o, multi["age"])
        add("age_depart", "Âge de départ à la retraite", "ans", " ans", series,
            "L'âge « conjoncturel » de départ : il monte sous l'effet des réformes. "
            "Chaque rapport reflète la législation du moment (réforme de 2023, "
            "aménagements de la LFSS 2026).",
            "COR / DREES, rapports 2023-2026 (âge conjoncturel).")
    p24 = _rows("partie 2", "Fig 2.4")
    if p24:
        pen = _ratio(_block_sub(p24, "Pension moyenne", "Obs"), _block_sub(p24, "Rémunération nett", "Obs"), 100)
        penp = _ratio(_block_sub(p24, "Pension moyenne", "Sc. Ref"), _block_sub(p24, "Rémunération nett", "Sc. Ref"), 100)
        desc = "La pension nette moyenne en % du salaire net moyen. Elle décroche au fil de la projection."
        if penp:
            y0, y1 = min(penp), max(penp)
            desc = (f"La pension nette moyenne en % du salaire net moyen. Elle décroche : "
                    f"~{penp[y0]:.0f} % aujourd'hui, ~{penp[y1]:.0f} % en {y1}.")
        add("pension_rel", "Pension moyenne rapportée au salaire net", "%", " %",
            _series(pen, penp, PENS), desc,
            "COR, rapport 2026 (fig. 2.4).")
    nv = _rows("synthèse", "Niveau de vie relatif")
    if nv:
        o, p = _obs_proj(nv, 100)
        series = _series(o, p, PENS, 1996)
        if "nv" in multi:
            series = vintage_series(o, multi["nv"], 1996)
        add("niveau_vie", "Niveau de vie des retraités / population", "%", " %",
            series,
            "Niveau de vie moyen des retraités rapporté à l'ensemble de la population "
            "(100 % = parité). Chaque rapport repousse un peu le décrochage projeté.",
            "COR / INSEE-DGI, rapports 2023-2026.", 1996)

    # --- Finances
    for iid, sheet, label, desc, mkey in [
        ("depenses", "Dépenses en %", "Dépenses de retraite (% du PIB)",
         "Ce que le système verse, en part de la richesse nationale.", "depenses"),
        ("ressources", "Ressources en %", "Ressources du système (% du PIB)",
         "Ce que le système encaisse (cotisations, impôts affectés…).", "ressources"),
        ("solde", "Solde en %", "Solde du système (% du PIB)",
         "Ressources − dépenses. Négatif = déficit.", "solde"),
    ]:
        r = _rows("synthèse", sheet)
        if r:
            o, p = _obs_proj(r, 100)
            series = _series(o, p, FIN)
            src = "COR, rapport 2026 (synthèse, scénario de référence)."
            if mkey in multi:
                series = vintage_series(o, multi[mkey])
                src = ("COR, rapports 2016-2026 — scénario de référence de chaque rapport "
                       "(1,3 % avant 2023 ; conventions comptables : « COR » jusqu'en 2019, "
                       "EPR ensuite).")
            add(iid, label, "% du PIB", " %", series, desc, src)

    # --- Sensibilité : faisceaux « et si l'hypothèse était différente ? »
    def dep_fan(rows):
        """Bloc 'Dépenses, en % du PIB' d'une figure de sensibilité : {clé: série}.

        Les sous-libellés sont en général 'Sc. Ref' / 'Var …' ; pour la
        sensibilité à la productivité (fig. 2.22 de 2026), ce sont des taux
        numériques (0.01, 0.004…) qu'on normalise en clés texte ('0.01').
        """
        ym = _ymap(rows)
        res, started = {}, False
        for r in rows:
            c1 = r[1] if len(r) > 1 else None
            c2 = r[2] if len(r) > 2 else None
            if c1 and str(c1).startswith("Dépenses, en % du PIB"):
                started = True
            if started and c1 and "Solde" in str(c1):
                break
            if not started:
                continue
            k = None
            if isinstance(c2, str) and (c2.strip() == "Sc. Ref" or c2.strip().startswith("Var")):
                k = c2.strip()
            elif isinstance(c2, float):
                k = format(c2, "g")
            if k:
                res[k] = {ym[i]: round(r[i] * 100, 3) for i in ym
                          if i < len(r) and isinstance(r[i], (int, float))}
        return res

    FANS = [
        ("sens_fec", "Si la fécondité changeait…", "Fig 2.18",
         [("fécondité haute", "Fécondité 1,7", "#2ca089"),
          ("fécondité basse", "Fécondité 1,2", "#d6452a")]),
        ("sens_ev", "Si on vivait plus ou moins longtemps…", "Fig 2.19",
         [("mortalité basse (EV haute)", "Espérance de vie haute", "#d6452a"),
          ("mortalité haute (EV basse)", "Espérance de vie basse", "#2ca089")]),
        ("sens_mig", "Si les migrations changeaient…", "Fig 2.20",
         [("smi haut", "Migrations hautes (+230 k)", "#2ca089"),
          ("smi bas", "Migrations basses (+70 k)", "#d6452a")]),
        ("sens_cho", "Si le chômage changeait…", "Fig 2.21",
         [("C5", "Chômage 5 %", "#2ca089"), ("C10", "Chômage 10 %", "#d6452a")]),
        ("sens_prod", "Si la productivité changeait…", "Fig 2.22",
         [("0.01", "Productivité 1,0 %", "#2ca089"),
          ("0.004", "Productivité 0,4 %", "#d6452a")]),
    ]
    for iid, label, sheet, variants in FANS:
        rows = _rows("partie 2", sheet)
        if not rows:
            continue
        fan = dep_fan(rows)
        ref = fan.get("Sc. Ref", {})
        if not ref:
            continue
        series = [{"label": "Scénario de référence", "color": "#1f4e79", "kind": "solid",
                   "points": [{"x": y, "y": ref[y]} for y in sorted(ref) if 2015 <= y <= 2070]}]
        spread = []
        for needle, vlabel, vcolor in variants:
            key = next((k for k in fan if needle.lower() in k.lower()), None)
            if not key:
                continue
            v = fan[key]
            series.append({"label": vlabel, "color": vcolor, "kind": "dash",
                           "points": [{"x": y, "y": v[y]} for y in sorted(v) if 2015 <= y <= 2070]})
            if 2070 in v:
                spread.append(v[2070])
        rng = (f" En 2070, les dépenses iraient de {min(spread):.1f} % à {max(spread):.1f} % du PIB "
               f"selon l'hypothèse (référence : {ref.get(2070, 0):.1f} %).") if len(spread) == 2 else ""
        b = _bounds(series)
        ind[iid] = {"label": label, "unit": "% du PIB", "suffix": " %",
                    "desc": "Dépenses de retraite en % du PIB selon l'hypothèse retenue." + rng,
                    "source": f"COR, rapport 2026 ({sheet}).", "series": series, **b}

    themes = [
        {"name": "Démographie", "indicators": ["cot_ret", "ratio_demo", "fecondite", "esp_vie", "migration"]},
        {"name": "Emploi & économie", "indicators": ["emploi", "chomage", "productivite"]},
        {"name": "Pensions & retraités", "indicators": ["age_depart", "pension_rel", "niveau_vie"]},
        {"name": "Finances du système", "indicators": ["depenses", "ressources", "solde"]},
        {"name": "Sensibilité : et si… ?", "indicators": ["sens_fec", "sens_ev", "sens_mig", "sens_cho", "sens_prod"]},
    ]
    # on ne garde que les indicateurs réellement extraits
    for t in themes:
        t["indicators"] = [i for i in t["indicators"] if i in ind]
    themes = [t for t in themes if t["indicators"]]
    print(f"✓ explorateur : {len(ind)} indicateurs")
    return {"themes": themes, "indicators": ind}


def extract_international(path):
    """Part des dépenses de retraite (publiques/privées) dans le PIB par pays.

    Gère les deux mises en page du COR :
    - 2025 (« Part des dépenses OCDE ») : pays en ligne 4, années 2000/2021 en
      ligne 5, puis publiques/privées ;
    - 2026 (« Dépenses_OCDE ») : bloc « En 2021 » avec un pays par colonne,
      lignes « Publiques » / « Privées » (premier bloc = rapporté au PIB).
    """
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = next((s for s in ("Dépenses_OCDE", "Part des dépenses OCDE")
                  if s in wb.sheetnames), None)
    if sheet is None:
        wb.close()
        return None
    rows = list(wb[sheet].iter_rows(values_only=True))
    wb.close()
    countries, year = [], 2021

    # Mise en page 2026 : ligne « En AAAA | pays… » suivie de Publiques/Privées.
    for i, r in enumerate(rows[:10]):
        c1 = str(r[1]).strip() if len(r) > 1 and r[1] is not None else ""
        if c1.startswith("En ") and c1[3:7].isdigit() and i + 2 < len(rows) \
                and str(rows[i + 1][1]).strip().startswith("Publiques"):
            year = int(c1[3:7])
            names, pub, priv = r, rows[i + 1], rows[i + 2]
            for j in range(2, len(names)):
                nm = names[j]
                if not (isinstance(nm, str) and nm.strip()):
                    continue
                p = pub[j] if j < len(pub) and isinstance(pub[j], (int, float)) else 0
                v = priv[j] if j < len(priv) and isinstance(priv[j], (int, float)) else 0
                countries.append({"name": nm.strip(),
                                  "pub": round(p * 100, 1), "priv": round(v * 100, 1),
                                  "total": round((p + v) * 100, 1)})
            break

    # Mise en page 2025 : pays et colonnes d'années côte à côte.
    if not countries:
        names, years, pub, priv = rows[3], rows[4], rows[5], rows[6]
        for i, nm in enumerate(names):
            if isinstance(nm, str) and nm.strip() and not nm.lower().startswith(("lecture", "champ", "source")):
                col = next((j for j in range(i, min(i + 5, len(years)))
                            if isinstance(years[j], int) and years[j] == year), None)
                if col is None:
                    continue
                p = pub[col] if col < len(pub) and isinstance(pub[col], (int, float)) else 0
                v = priv[col] if col < len(priv) and isinstance(priv[col], (int, float)) else 0
                countries.append({"name": nm.strip(),
                                  "pub": round(p * 100, 1), "priv": round(v * 100, 1),
                                  "total": round((p + v) * 100, 1)})
    if not countries:
        return None
    countries.sort(key=lambda c: c["total"], reverse=True)
    return {"year": year, "countries": countries}


def extract_leviers(path, sheet="Fig 2.24"):
    """Calibrage des 3 leviers : ajustement (via un seul levier) pour équilibrer en 2070."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if sheet not in wb.sheetnames:
        wb.close()
        return None
    rows = list(wb[sheet].iter_rows(values_only=True))
    ym = {i: c for i, c in enumerate(rows[3]) if isinstance(c, int) and 1990 <= c <= 2100}
    col = next((i for i, c in ym.items() if c == 2070), None)
    if col is None:
        wb.close()
        return None

    def g(i):
        return rows[i][col] if col < len(rows[i]) and isinstance(rows[i][col], (int, float)) else None

    pen_ref, pen_eq = g(4), g(5)          # pension relative
    age_ref, age_eq = g(6), g(7)          # âge effectif moyen
    tx_ref, tx_eq = g(8), g(9)            # taux de prélèvement
    wb.close()
    return {
        "horizon": 2070,
        "age": {"ref": round(age_ref, 2), "full_years": round(age_eq - age_ref, 2)},
        "cotis": {"ref": round(tx_ref * 100, 1), "full_pts": round((tx_eq - tx_ref) * 100, 2)},
        "pension": {"ref_pct": round(pen_ref * 100, 1),
                    "full_pct": round((pen_ref - pen_eq) / pen_ref * 100, 1)},
        "source": f"COR, rapport 2026 ({sheet.lower().replace('fig ', 'fig. ')}) — "
                  "niveau de chaque levier pour équilibrer en 2070.",
    }


def build():
    extracted = {}
    realised = None  # série observée la plus récente (rapport LATEST)
    for vy, dpat, fpat, prod in VINTAGES:
        path = first_file(dpat, fpat)
        if not path:
            print("✗ fichier introuvable :", vy)
            continue
        data = extract_depenses(path, prod)
        if not data or not data["projection"]:
            print("✗ bloc dépenses introuvable :", vy)
            continue
        extracted[vy] = data
        if vy == LATEST:
            realised = data["observed"]
        print(f"✓ {vy} : {len(data['projection'])} points de projection")

    # Série « réalisé » : on prend l'observé du rapport le plus récent.
    realised = realised or next(iter(extracted.values()))["observed"]
    realise_points = [{"x": y, "y": realised[y]} for y in sorted(realised)]

    projections = []
    for vy, _, _, _ in VINTAGES:
        if vy not in extracted:
            continue
        proj = extracted[vy]["projection"]
        years = sorted(proj)
        pts = [{"x": y, "y": proj[y]} for y in years]
        last = years[-1]
        projections.append({
            "label": f"Rapport {vy} (prod. {PROD_LABEL[vy]} %)",
            "year": int(vy),
            "color": COLORS[vy],
            "endNote": vy,
            "source": f"COR, rapport annuel {vy} — dépenses du système de retraite "
                      f"en % du PIB, scénario {PROD_LABEL[vy]} %.",
            "points": pts,
        })

    # ---- Solde et ressources : projections de TOUS les millésimes disponibles.
    #      Réalisé = série observée du rapport le plus récent.
    solde_multi = extract_fin_multi(SOLDE_SOURCES, "solde")
    ressources_multi = extract_fin_multi(RESSOURCES_SOURCES, "ressources")
    conv_by_vy = {vy: conv for vy, _, _, _, _, _, conv in SOLDE_SOURCES}

    sdr_latest = None
    latest_synth = first_file(f"{LATEST}-06", "synthèse")
    if latest_synth:
        sdr_latest = extract_sdr(latest_synth, "Solde dépenses ressources")
    solde_obs = (sdr_latest or {}).get("Solde", {})
    solde_realise = [{"x": y, "y": solde_obs[y]} for y in sorted(solde_obs) if y <= int(LATEST)]

    solde_proj = []
    for vy in sorted(solde_multi):
        solde = solde_multi[vy]
        year = int(vy)
        # projection = à partir de l'année du rapport ; réalisé = avant.
        pts = [{"x": y, "y": solde[y]} for y in sorted(solde) if y >= year]
        if not pts:
            continue
        solde_proj.append({
            "label": f"Rapport {vy} ({PROD_LABEL[vy]} %, {conv_by_vy[vy]})",
            "year": year, "color": COLORS[vy], "endNote": vy,
            "source": f"COR, rapport annuel {vy} — solde du système de retraite, "
                      f"scénario {PROD_LABEL[vy]} %, {conv_by_vy[vy]}.",
            "points": pts,
        })
        print(f"✓ solde {vy} : 2070={solde.get(2070)}  pts proj={len(pts)}")

    solde_block = None
    if solde_proj:
        ys = [p["y"] for pr in solde_proj for p in pr["points"]] \
            + [p["y"] for p in solde_realise]
        solde_block = {
            "title": "Le solde du système de retraite plonge dans les projections récentes",
            "subtitle": "Solde (ressources − dépenses) en % du PIB — scénario de référence de "
                        "chaque rapport (convention « COR » jusqu'en 2019, EPR ensuite)",
            "yLabel": "% du PIB",
            "yMin": round(min(ys) - 0.3, 1), "yMax": round(max(ys) + 0.3, 1),
            "xMin": 2000, "xMax": 2070,
            "realise": {"label": "Solde réalisé (observé)", "color": "#1f2d3d",
                        "kind": "solid", "points": solde_realise or []},
            "projections": solde_proj,
        }

    # ---- Dépenses vs Ressources (effet « ciseaux »), rapport le plus récent
    ciseaux_block = None
    if sdr_latest:
        dep = sdr_latest.get("Dépenses", {})
        res = sdr_latest.get("Ressources", {})
        ys = sorted(set(dep) | set(res))
        ciseaux_block = {
            "title": "Pourquoi un déficit ? Les dépenses montent, les ressources baissent",
            "subtitle": f"Système de retraite en % du PIB — scénario de référence du rapport {LATEST}",
            "yLabel": "% du PIB", "yMin": 12, "yMax": 15.5, "xMin": 2000, "xMax": 2070,
            "series": [
                {"label": "Dépenses", "color": "#c2185b", "kind": "solid",
                 "points": [{"x": y, "y": dep[y]} for y in ys if y in dep]},
                {"label": "Ressources", "color": "#2f6fb0", "kind": "solid",
                 "points": [{"x": y, "y": res[y]} for y in ys if y in res]},
            ],
        }

    # ---- Niveau de vie relatif des retraités : un millésime par rapport (2023+)
    nv_obs, nv_projs = {}, {}
    for vy, dpat, sheet, selector in NV_SOURCES:
        path = first_file(dpat, "synthèse")
        if not path:
            print("✗ niveau de vie : fichier introuvable", vy)
            continue
        o, ref = extract_nv_vintage(path, sheet, selector)
        if ref:
            nv_projs[vy] = ref
        else:
            print("✗ niveau de vie : projection introuvable", vy)
        if vy == LATEST and o:
            nv_obs = o

    niveau_block = None
    if nv_obs and nv_projs:
        # On démarre à 1996 (données annuelles continues) pour éviter les longues
        # interpolations des points épars d'avant.
        obs_pts = [{"x": y, "y": nv_obs[y]} for y in sorted(nv_obs) if y >= 1996]
        nv_proj_list = []
        for vy in sorted(nv_projs):
            ref = nv_projs[vy]
            pts = [{"x": y, "y": ref[y]} for y in sorted(ref) if y >= int(vy)]
            nv_proj_list.append({
                "label": f"Rapport {vy}", "year": int(vy), "color": COLORS[vy],
                "endNote": vy,
                "source": f"COR, rapport annuel {vy} — niveau de vie relatif des retraités, "
                          "scénario de référence.",
                "points": pts,
            })
        niveau_block = {
            "title": "Le niveau de vie des retraités décrocherait peu à peu",
            "subtitle": "Niveau de vie moyen des retraités rapporté à celui de l'ensemble de la "
                        "population (100 % = parité) — projection de chaque rapport",
            "yLabel": "%", "yMin": 80, "yMax": 110,
            "xMin": 1996, "xMax": 2070,
            "realise": {"label": "Observé", "color": "#1f2d3d", "kind": "solid", "points": obs_pts},
            "projections": nv_proj_list,
        }
        print(f"✓ niveau de vie : obs {len(obs_pts)} pts, {len(nv_proj_list)} millésimes "
              f"(2070 : {', '.join(f'{vy}={nv_projs[vy].get(2070)}' for vy in sorted(nv_projs))})")

    # ---- Âge conjoncturel : un millésime par rapport (2023+), pour l'explorateur
    age_obs, age_projs = {}, {}
    for vy, dpat, sheet in AGE_SOURCES:
        path = first_file(dpat, "synthèse")
        if not path:
            continue
        o, p = extract_age_vintage(path, sheet)
        if p:
            age_projs[vy] = {y: p[y] for y in p if y >= int(vy)}
        if vy == LATEST and o:
            age_obs = o
    if age_projs:
        print(f"✓ âge conjoncturel : {len(age_projs)} millésimes "
              f"(2070 : {', '.join(f'{vy}={age_projs[vy].get(2070)}' for vy in sorted(age_projs))})")

    # ---- Fécondité : observé (réel) + hypothèse centrale de trois époques
    fecondite_block = None
    f_2026 = extract_fecondite(first_file("2026-06", "partie 1") or "")
    f_2025 = extract_fecondite(first_file("2025-06", "juin 2025 - partie 1") or "")
    f_old = extract_fecondite(first_file("2019-06", "Partie 1") or "")
    if f_2026 and f_2026["observed"]:
        obs = f_2026["observed"]
        obs_pts = [{"x": y, "y": obs[y]} for y in sorted(obs)]

        def central_line(fec, ymin):
            c = fec["central"]
            return [{"x": y, "y": c[y]} for y in sorted(c) if y >= ymin]
        hyps = []
        if f_old and f_old["central"]:
            hyps.append({"label": "Hypothèse centrale 2016-2021 (1,95)",
                         "color": "#2ca089", "kind": "dash", "endNote": "1,95",
                         "points": central_line(f_old, 2017)})
        if f_2025 and f_2025["central"]:
            hyps.append({"label": "Hypothèse centrale 2022-2025 (1,80)",
                         "color": "#e8731c", "kind": "dash", "endNote": "1,80",
                         "points": central_line(f_2025, 2023)})
        if f_2026["central"]:
            hyps.append({"label": "Hypothèse centrale 2026 (1,45)",
                         "color": "#7b1fa2", "kind": "dash", "endNote": "1,45",
                         "points": central_line(f_2026, 2025)})
        fecondite_block = {
            "title": "Fécondité : l'hypothèse, longtemps trop haute, passe sous la réalité",
            "subtitle": "Indice conjoncturel de fécondité (enfants par femme)",
            "yLabel": "", "yMin": 1.35, "yMax": 2.05, "xMin": 2000, "xMax": 2050,
            "realise": {"label": "Fécondité réelle observée", "color": "#1f2d3d",
                        "kind": "solid", "points": [p for p in obs_pts if p["x"] >= 2000]},
            "hypotheses": hyps,
        }
        print(f"✓ fécondité : obs→{obs_pts[-1]['x']}={obs_pts[-1]['y']}  hypothèses={len(hyps)}")

    # ---- Productivité réelle (moyenne mobile) vs hypothèses
    prod_block = None
    annual = extract_productivite_obs(first_file("2026-06", "partie 1") or "")
    if annual:
        ma = [p for p in moving_average(annual, 5) if p["x"] >= 2000]
        xs = [p["x"] for p in ma]
        x0, x1 = min(xs), max(xs)
        prod_block = {
            "title": "Productivité : ce que le COR suppose vs ce qui se passe vraiment",
            "subtitle": "Croissance de la productivité du travail (%/an, moyenne mobile 5 ans pour l'observé)",
            "yLabel": "% / an", "yMin": -0.5, "yMax": 3, "xMin": 2000, "xMax": 2030,
            "realise": {"label": "Productivité réellement observée (moy. mobile)",
                        "color": "#1f2d3d", "kind": "solid", "points": ma},
            "hypotheses": [
                {"label": "Hypothèse 1,3 % (rapports jusqu'à 2022)", "color": "#d6452a",
                 "kind": "dash", "endNote": "1,3 %",
                 "points": [{"x": x0, "y": 1.3}, {"x": 2030, "y": 1.3}]},
                {"label": "Hypothèse 0,7 % (référence depuis 2025)", "color": "#c2185b",
                 "kind": "dash", "endNote": "0,7 %",
                 "points": [{"x": x0, "y": 0.7}, {"x": 2030, "y": 0.7}]},
            ],
        }
        print(f"✓ productivité obs : {x0}-{x1}, {len(ma)} pts")

    # ---- Hypothèses démographiques : scénario central de chaque époque
    #      (espérance de vie et migration changent avec chaque jeu de
    #      projections INSEE ; la fécondité est reprise des blocs ci-dessus).
    ev_hyps = {}
    for vy, dpat, fpat in [("2019", "2019-06", "Partie 1"),
                           ("2025", "2025-06", "juin 2025 - partie 1"),
                           ("2026", "2026-06", "partie 1")]:
        s = labeled_row(first_file(dpat, fpat), ("espérance de vie", "65 ans"),
                        "scénario central")
        if s:
            ev_hyps[vy] = {y: v for y, v in s.items() if y >= int(vy)}
    if ev_hyps:
        print(f"✓ espérance de vie : {len(ev_hyps)} époques "
              f"(2070 : {', '.join(f'{vy}={ev_hyps[vy].get(2070)}' for vy in sorted(ev_hyps))})")

    mig_hyps = {}
    for vy, dpat, fpat in [("2025", "2025-06", "juin 2025 - partie 1"),
                           ("2026", "2026-06", "partie 1")]:
        s = labeled_row(first_file(dpat, fpat), ("solde migratoire",),
                        "scénario central", 0.001)
        if s:
            mig_hyps[vy] = {y: v for y, v in s.items() if y >= int(vy)}
    if mig_hyps:
        print(f"✓ migration : {len(mig_hyps)} époques")

    fec_hyps = {}
    for vy, f in (("2019", f_old), ("2025", f_2025), ("2026", f_2026)):
        if f and f["central"]:
            fec_hyps[vy] = {y: v for y, v in f["central"].items() if y >= int(vy)}

    # Séries multi-millésimes mises à disposition de l'explorateur : pour
    # chaque indicateur, les projections de tous les rapports qui publient
    # le même jeu de données, à superposer au réalisé.
    multi = {
        "depenses": {vy: d["projection"] for vy, d in extracted.items()},
        "ressources": ressources_multi,
        "solde": solde_multi,
        "nv": nv_projs,
        "age": age_projs,
        "esp_vie": ev_hyps,
        "migration": mig_hyps,
        "fecondite": fec_hyps,
    }

    out = {
        "depensesPib": {
            "title": "La part des retraites dans le PIB selon les rapports successifs du COR",
            "subtitle": "Dépenses de retraite en % du PIB — scénario de référence de chaque rapport (données officielles du COR)",
            "yLabel": "% du PIB",
            "yMin": 11.5,
            "yMax": 15.5,
            "xMin": 2000,
            "xMax": 2070,
            "realise": {
                "label": "Réalisé (observé)",
                "color": "#1f2d3d",
                "kind": "solid",
                "points": realise_points,
            },
            "projections": projections,
        },
        "solde": solde_block,
        "ressourcesVsDepenses": ciseaux_block,
        "niveauVie": niveau_block,
        "fecondite": fecondite_block,
        "productiviteReel": prod_block,
        "explorer": build_explorer(multi),
        "international": extract_international(first_file(R26, "synthèse") or ""),
        "leviers": extract_leviers(first_file(R26, "partie 2") or ""),
    }

    dest = os.path.join(os.path.dirname(__file__), "..", "data", "cor-series.generated.js")
    with open(dest, "w", encoding="utf-8") as f:
        f.write("/* FICHIER GÉNÉRÉ — ne pas éditer à la main.\n")
        f.write("   Source : fichiers Excel officiels du COR (data/Données du COR/).\n")
        f.write("   Régénérer avec : python3 tools/extract_cor.py */\n")
        f.write("window.COR_SERIES = ")
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print("\nÉcrit :", os.path.relpath(dest))
    print("Millésimes :", ", ".join(k for k in extracted))


if __name__ == "__main__":
    build()
