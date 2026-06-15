#!/usr/bin/env python3
"""Génère le logo « COR » (livre auréolé) en SVG et toutes les icônes dérivées.

Source unique : ce script construit le badge en SVG (carré bleu marine, auréole
dorée, livre fermé avec reliure, « COR » en bâton gras et trois lignes dorées)
puis le rastérise en PNG via cairosvg.

Produit :
  - icon.svg            (favicon, fond bleu marine)
  - icon-no-bg.svg      (logo du bandeau : vecteur, fond transparent)
  - icon-192.png        (apple-touch-icon, PWA)
  - icon-512.png        (PWA)
  - icon-maskable.png   (PWA maskable, fond plein + zone de sécurité)
  - og-image.png        (aperçu réseaux sociaux 1200×630)

Réexécuter après toute retouche du visuel :  python3 icons/make_icons.py
Dépendance : cairosvg  (pip install cairosvg ; nécessite libcairo).
"""
import os
import sys

# ---------------------------------------------------------------- palette ----
NAVY    = "#16294d"   # bleu marine du fond et du « COR »
SLATE   = "#52638c"   # bleu adouci, traits fins : plat arrière, bords, tranche
RELIURE = "#33497c"   # bleu un peu plus foncé : la reliure (trait large)
GOLD    = "#f0a92a"   # doré chaud (auréole, lignes)
WHITE   = "#ffffff"
SANS  = "Liberation Sans, DejaVu Sans, Arial, sans-serif"


def halo():
    """Auréole : anneau doré DROIT (non incliné), au-dessus du livre.

    Volontairement sans remplissage : aucun aplat bleu au centre.
    """
    return (f'<ellipse cx="252" cy="68" rx="160" ry="30" fill="none" '
            f'stroke="{GOLD}" stroke-width="20"/>')


def book(outline=False):
    """Livre en traits fins : couverture, dos à gauche, tranche, pied retroussé.

    Le dos se lit comme DEUX traits : un plat arrière FIN, le blanc des pages,
    puis la RELIURE — un trait nettement plus LARGE et un peu plus foncé (proportions
    relevées sur l'original : reliure ≈ 1,5× la largeur du plat arrière).

    outline=False (favicon, fond plein) : pas de contour, les aplats blancs
    portent la forme ; la reliure reste tracée sur la couverture blanche.
    """
    edge = (f' stroke="{SLATE}" stroke-width="4.5" stroke-linejoin="round"'
            if outline else '')
    return f'''
    <!-- plat arrière (dos), trait fin + pied retroussé ; le blanc = les pages -->
    <path d="M96 150 L96 440 C96 462 112 470 126 461"
          fill="none" stroke="{SLATE if outline else WHITE}" stroke-width="7.5" stroke-linecap="round"/>
    <!-- tranche basse (pages) -->
    <rect x="112" y="442" width="302" height="24" rx="6" fill="{WHITE}"{edge}/>
    <!-- couverture : bords fins -->
    <rect x="130" y="120" width="284" height="324" rx="10" fill="{WHITE}"{edge}/>
    <!-- RELIURE : trait large et plus foncé sur le bord gauche -->
    <line x1="131" y1="130" x2="131" y2="434" stroke="{RELIURE}" stroke-width="11" stroke-linecap="round"/>'''


def cor():
    """« COR » en bâton gras, occupant la couverture (à droite de la reliure)."""
    return (f'<text x="280" y="292" font-family="{SANS}" font-size="112" '
            f'font-weight="700" text-anchor="middle" fill="{NAVY}">COR</text>')


def lines():
    """Trois lignes dorées sous le « COR », flottantes (ne touchent ni le dos
    ni le bord de la couverture)."""
    segs = [(346, 386), (376, 350), (406, 306)]   # (y, x de fin), gauche fixe
    return "\n    ".join(
        f'<line x1="174" y1="{y}" x2="{x2}" y2="{y}" stroke="{GOLD}" '
        f'stroke-width="15" stroke-linecap="round"/>' for (y, x2) in segs)


def badge(maskable=False, bg=True):
    """SVG complet du badge (512×512). maskable : fond plein + zone de sécurité.

    Livre portrait agrandi au maximum (marge minime sur les côtés, qu'un format
    vertical ne peut pas supprimer entièrement). En maskable, l'OS rogne les
    bords : on réduit le contenu dans la zone de sécurité.

    bg=False : fond transparent (logo du bandeau). Le livre reçoit un contour
    bleu marine pour rester lisible sur fond clair ; l'auréole reste un simple
    anneau doré, sans aucun aplat bleu.
    """
    radius = 0 if maskable else 100
    if maskable:
        wrap_open = '<g transform="translate(256,256) scale(0.68) translate(-256,-261)">'
        wrap_close = '</g>'
    else:
        wrap_open = ''
        wrap_close = ''
    background = (f'<rect width="512" height="512" rx="{radius}" fill="{NAVY}"/>'
                 if bg else '')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Ceci est mon COR">
  {background}
  {wrap_open}
    {halo()}
    {book(outline=not bg)}
    {cor()}
    {lines()}
  {wrap_close}
</svg>'''


# --------------------------------------------------------------- og-image ----
def og_image():
    """Carte de partage 1200×630 : titre, chiffres-clés et le logo à droite."""
    nested = badge(False).replace(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Ceci est mon COR">',
        '<svg x="838" y="150" width="320" height="320" viewBox="0 0 512 512">', 1)

    headline = ["Le COR change-t-il", "d'avis sur nos", "retraites&#160;?"]
    head = "".join(
        f'<text x="64" y="{182 + i*76}" font-family="{SANS}" font-size="64" '
        f'font-weight="700" fill="#ffffff">{ln}</text>'
        for i, ln in enumerate(headline)
    )
    subtitle = ["L'évolution des hypothèses du Conseil",
                "d'orientation des retraites, 2001–2026."]
    sub = "".join(
        f'<text x="66" y="{446 + i*40}" font-family="{SANS}" font-size="29" '
        f'fill="#d7e6f4">{ln}</text>'
        for i, ln in enumerate(subtitle)
    )

    pills = [("0,7&#160;%", "productivité supposée", "(avant&#160;: 1,3&#160;%)"),
             ("1,62", "fécondité réelle 2024", "(supposée&#160;: 1,80)"),
             ("−1,4&#160;%", "du PIB&#160;: solde", "projeté en 2070")]
    pw, gap, py = 230, 18, 524
    cells = []
    for i, (big, l1, l2) in enumerate(pills):
        px = 64 + i * (pw + gap)
        cells.append(
            f'<rect x="{px}" y="{py}" width="{pw}" height="86" rx="14" '
            f'fill="#ffffff" fill-opacity="0.10" stroke="#ffffff" stroke-opacity="0.18"/>'
            f'<text x="{px+18}" y="{py+40}" font-family="{SANS}" font-size="34" '
            f'font-weight="700" fill="#ffffff">{big}</text>'
            f'<text x="{px+18}" y="{py+58}" font-family="{SANS}" font-size="15" '
            f'fill="#cdddee">{l1}</text>'
            f'<text x="{px+18}" y="{py+76}" font-family="{SANS}" font-size="15" '
            f'fill="#cdddee">{l2}</text>'
        )
    pillsvg = "".join(cells)

    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="ogbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1f4e79"/>
      <stop offset="100%" stop-color="#2f6fb0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#ogbg)"/>
  <circle cx="998" cy="310" r="186" fill="#ffffff" fill-opacity="0.05"/>
  <circle cx="998" cy="310" r="174" fill="none" stroke="#f0a92a" stroke-opacity="0.30" stroke-width="2"/>
  <text x="66" y="86" font-family="{SANS}" font-size="22" font-weight="700"
        letter-spacing="3" fill="#b9cfe6">OUTIL CITOYEN · DONNÉES OFFICIELLES</text>
  {head}
  {sub}
  {pillsvg}
  {nested}
</svg>'''


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out_dir, exist_ok=True)

    svg = badge(maskable=False)
    with open(os.path.join(out_dir, "icon.svg"), "w", encoding="utf-8") as f:
        f.write(svg)
    print("écrit icon.svg")

    # logo du bandeau : vrai vecteur, fond transparent, sans aplat bleu
    with open(os.path.join(out_dir, "icon-no-bg.svg"), "w", encoding="utf-8") as f:
        f.write(badge(maskable=False, bg=False))
    print("écrit icon-no-bg.svg")

    try:
        import cairosvg
    except ImportError:
        print("cairosvg absent : SVG écrit, PNG non régénérés (pip install cairosvg).")
        return

    for size in (192, 512):
        # fond opaque (= couleur du fond) : évite les coins transparents que
        # iOS comblerait en noir pour l'apple-touch-icon.
        cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(out_dir, f"icon-{size}.png"),
                         output_width=size, output_height=size, background_color=NAVY)
        print(f"écrit icon-{size}.png")
    cairosvg.svg2png(bytestring=badge(maskable=True).encode(),
                     write_to=os.path.join(out_dir, "icon-maskable.png"),
                     output_width=512, output_height=512)
    print("écrit icon-maskable.png")

    cairosvg.svg2png(bytestring=og_image().encode(),
                     write_to=os.path.join(out_dir, "og-image.png"),
                     output_width=1200, output_height=630)
    print("écrit og-image.png")


if __name__ == "__main__":
    main()
