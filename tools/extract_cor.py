#!/usr/bin/env python3
"""Extraction reproductible des séries du COR depuis les fichiers Excel.

Lit les fichiers Excel officiels rangés sous `data/Données du COR/` et génère
`data/cor-series.generated.js` (window.COR_SERIES), consommé par le site.

But : remplacer les valeurs d'amorçage par les CHIFFRES OFFICIELS, de façon
traçable (réexécuter ce script régénère les données).

Lancement :  python3 tools/extract_cor.py
Dépendance :  openpyxl
"""
import glob, os, json, openpyxl

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
]

# Productivité de référence affichée dans la légende (en %).
PROD_LABEL = {"2016": "1,3", "2017": "1,3", "2018": "1,3", "2019": "1,3",
              "2020": "1,3", "2021": "1,3", "2022": "1,3", "2023": "1,0",
              "2024": "1,0", "2025": "0,7"}

# Couleur par millésime : dégradé gris → bleu → vert → orange → rouge,
# pour lire visuellement l'écoulement du temps (2025 = le plus saillant).
COLORS = {"2016": "#9aa7b4", "2017": "#7d8ca0", "2018": "#5b6f93",
          "2019": "#3f7cb0", "2020": "#2ca089", "2021": "#6aa84f",
          "2022": "#e0a800", "2023": "#e8731c", "2024": "#d6452a",
          "2025": "#c2185b"}


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
# Solde / Ressources (synthèses 2023-2025) — scénario de référence
# --------------------------------------------------------------------------
SOLDE_VINTAGES = [
    ("2023", "2023-06", "synthèse", "Solde_dép_ress", "1,0"),
    ("2024", "2024-06", "synthèse", "Solde dépenses ressources", "1,0"),
    ("2025", "2025-06", "synthèse", "Solde dépenses ressources", "0,7"),
]
SOLDE_COLORS = {"2023": "#e8731c", "2024": "#d6452a", "2025": "#c2185b"}


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


def extract_niveau_vie(path):
    """Niveau de vie relatif des retraités : observé + scénario de référence."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    if "Niveau de vie relatif" not in wb.sheetnames:
        wb.close()
        return None
    ws = wb["Niveau de vie relatif"]
    rows = list(ws.iter_rows(values_only=True))
    ycols = {}
    for r in rows[:6]:
        ints = {i: c for i, c in enumerate(r)
                if isinstance(c, int) and 1960 <= c <= 2100}
        if ints:
            ycols = ints
            break
    obs, ref = {}, {}
    for r in rows:
        c2 = r[2] if len(r) > 2 else None
        vals = {ycols[i]: round(r[i] * 100, 1)
                for i in ycols if i < len(r) and isinstance(r[i], (int, float))}
        if c2 == "Observations":
            obs = vals
        elif c2 == "Scénario de référence":
            ref = vals
    wb.close()
    return {"observed": obs, "ref": ref}


def build():
    extracted = {}
    realised = None  # série observée la plus récente (rapport 2025, base 2020)
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
        if vy == "2025":
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

    # ---- Solde du système (réf.), millésimes 2023-2025 + Dépenses/Ressources 2025
    solde_proj = []
    sdr_2025 = None
    solde_realise = None
    for vy, dpat, fpat, sheet, prodlbl in SOLDE_VINTAGES:
        path = first_file(dpat, fpat)
        if not path:
            print("✗ solde fichier introuvable :", vy)
            continue
        sdr = extract_sdr(path, sheet)
        if not sdr or "Solde" not in sdr:
            print("✗ solde bloc introuvable :", vy)
            continue
        if vy == "2025":
            sdr_2025 = sdr
        solde = sdr["Solde"]
        year = int(vy)
        # projection = à partir de l'année du rapport ; réalisé = avant.
        pts = [{"x": y, "y": solde[y]} for y in sorted(solde) if y >= year]
        last = max(p["x"] for p in pts)
        solde_proj.append({
            "label": f"Rapport {vy} (réf. {prodlbl} %)",
            "year": year, "color": SOLDE_COLORS[vy], "endNote": vy,
            "source": f"COR, rapport annuel {vy} — solde du système de retraite, scénario de référence.",
            "points": pts,
        })
        if vy == "2025":
            solde_realise = [{"x": y, "y": solde[y]} for y in sorted(solde) if y <= year]
        print(f"✓ solde {vy} : 2070={solde.get(2070)}  pts proj={len(pts)}")

    solde_block = None
    if solde_proj:
        solde_block = {
            "title": "Le solde du système de retraite plonge dans les projections récentes",
            "subtitle": "Solde (ressources − dépenses) en % du PIB — scénario de référence de chaque rapport",
            "yLabel": "% du PIB", "yMin": -2, "yMax": 1, "xMin": 2000, "xMax": 2070,
            "realise": {"label": "Solde réalisé (observé)", "color": "#1f2d3d",
                        "kind": "solid", "points": solde_realise or []},
            "projections": solde_proj,
        }

    # ---- Dépenses vs Ressources 2025 (effet « ciseaux »)
    ciseaux_block = None
    if sdr_2025:
        dep = sdr_2025.get("Dépenses", {})
        res = sdr_2025.get("Ressources", {})
        ys = sorted(set(dep) | set(res))
        ciseaux_block = {
            "title": "Pourquoi un déficit ? Les dépenses montent, les ressources baissent",
            "subtitle": "Système de retraite en % du PIB — scénario de référence du rapport 2025",
            "yLabel": "% du PIB", "yMin": 12, "yMax": 15, "xMin": 2000, "xMax": 2070,
            "series": [
                {"label": "Dépenses", "color": "#c2185b", "kind": "solid",
                 "points": [{"x": y, "y": dep[y]} for y in ys if y in dep]},
                {"label": "Ressources", "color": "#2f6fb0", "kind": "solid",
                 "points": [{"x": y, "y": res[y]} for y in ys if y in res]},
            ],
        }

    # ---- Niveau de vie relatif des retraités (rapport 2025)
    niveau_block = None
    nv_path = first_file("2025-06", "synthèse")
    nv = extract_niveau_vie(nv_path) if nv_path else None
    if nv and nv["observed"]:
        obs_pts = [{"x": y, "y": nv["observed"][y]} for y in sorted(nv["observed"])]
        ref_pts = [{"x": y, "y": nv["ref"][y]} for y in sorted(nv["ref"])]
        niveau_block = {
            "title": "Le niveau de vie des retraités décrocherait peu à peu",
            "subtitle": "Niveau de vie moyen des retraités rapporté à celui de l'ensemble de la population (100 % = parité)",
            "yLabel": "%", "yMin": 70, "yMax": 110,
            "xMin": 1995, "xMax": 2070,
            "realise": {"label": "Observé", "color": "#1f2d3d", "kind": "solid", "points": obs_pts},
            "projection": {"label": "Projeté (réf. 2025)", "color": "#c2185b", "kind": "dash", "points": ref_pts},
        }
        print(f"✓ niveau de vie : obs {len(obs_pts)} pts, proj {len(ref_pts)} pts")

    # ---- Fécondité : observé (réel) + hypothèse centrale de deux époques
    fecondite_block = None
    f_recent = extract_fecondite(first_file("2025-06", "juin 2025 - partie 1") or "")
    f_old = extract_fecondite(first_file("2019-06", "Partie 1") or "")
    if f_recent and f_recent["observed"]:
        obs = f_recent["observed"]
        obs_pts = [{"x": y, "y": obs[y]} for y in sorted(obs)]

        def central_line(fec, ymin):
            c = fec["central"]
            return [{"x": y, "y": c[y]} for y in sorted(c) if y >= ymin]
        hyps = []
        if f_old and f_old["central"]:
            hyps.append({"label": "Hypothèse centrale 2016-2021 (1,95)",
                         "color": "#2ca089", "kind": "dash", "endNote": "1,95",
                         "points": central_line(f_old, 2017)})
        if f_recent["central"]:
            hyps.append({"label": "Hypothèse centrale 2022-2025 (1,80)",
                         "color": "#e8731c", "kind": "dash", "endNote": "1,80",
                         "points": central_line(f_recent, 2023)})
        fecondite_block = {
            "title": "Fécondité : une hypothèse revue à la baisse, mais que la réalité dépasse",
            "subtitle": "Indice conjoncturel de fécondité (enfants par femme)",
            "yLabel": "", "yMin": 1.5, "yMax": 2.05, "xMin": 2000, "xMax": 2050,
            "realise": {"label": "Fécondité réelle observée", "color": "#1f2d3d",
                        "kind": "solid", "points": [p for p in obs_pts if p["x"] >= 2000]},
            "hypotheses": hyps,
        }
        print(f"✓ fécondité : obs→{obs_pts[-1]['x']}={obs_pts[-1]['y']}  hypothèses={len(hyps)}")

    # ---- Productivité réelle (moyenne mobile) vs hypothèses
    prod_block = None
    annual = extract_productivite_obs(first_file("2025-06", "juin 2025 - partie 1") or "")
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
                {"label": "Hypothèse 0,7 % (référence 2025)", "color": "#c2185b",
                 "kind": "dash", "endNote": "0,7 %",
                 "points": [{"x": x0, "y": 0.7}, {"x": 2030, "y": 0.7}]},
            ],
        }
        print(f"✓ productivité obs : {x0}-{x1}, {len(ma)} pts")

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
