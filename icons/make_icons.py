#!/usr/bin/env python3
"""Génère le logo « Ceci est mon COR » (SVG) et toutes les icônes dérivées.

Source unique : ce script construit le badge en SVG (carré bleu marine, liseré
doré, halo de rayons, livre ouvert, titre « Ceci est mon » en arc et « COR »
avec le O doré) puis le rastérise en PNG via cairosvg.

Produit :
  - icon.svg            (favicon + bandeau du site)
  - icon-192.png        (apple-touch-icon, PWA)
  - icon-512.png        (PWA)
  - icon-maskable.png   (PWA maskable, fond plein + zone de sécurité)
  - og-image.png        (aperçu réseaux sociaux 1200×630)

Réexécuter après toute retouche du visuel :  python3 icons/make_icons.py
Dépendance : cairosvg  (pip install cairosvg ; nécessite libcairo).
"""
import math
import os
import sys

# ---------------------------------------------------------------- palette ----
NAVY      = "#16294d"   # bleu marine profond du fond
NAVY_DEEP = "#101f3d"
GOLD      = "#c89b3e"   # doré antique (liseré, rayons, lettre O)
WHITE     = "#ffffff"
SERIF     = "Liberation Serif, Times New Roman, Georgia, serif"


def sunburst(cx, cy, n=13, r0=28, lmax=116, lmin=52, spread=90, w=7):
    """Renvoie les <polygon> d'un halo de rayons dorés rayonnant vers le haut."""
    out = []
    for i in range(n):
        # angle depuis la verticale, réparti symétriquement de -spread à +spread
        a = math.radians((-1 + 2 * i / (n - 1)) * spread)
        dx, dy = math.sin(a), -math.cos(a)          # direction du rayon (vers le haut)
        px, py = math.cos(a), math.sin(a)           # perpendiculaire (base du rayon)
        # rayons les plus longs vers le haut ; max(0,…) évite tout cosinus négatif
        length = lmin + (lmax - lmin) * (max(0.0, math.cos(a)) ** 1.3)
        bx, by = cx + dx * r0, cy + dy * r0          # centre de la base
        tx, ty = cx + dx * (r0 + length), cy + dy * (r0 + length)  # pointe
        hw = w / 2
        out.append(
            f'<polygon points="{tx:.1f},{ty:.1f} '
            f'{bx + px * hw:.1f},{by + py * hw:.1f} '
            f'{bx - px * hw:.1f},{by - py * hw:.1f}"/>'
        )
    return "\n      ".join(out)


def book():
    """Livre ouvert : couverture dorée, pages blanches, tranches, reliure."""
    # Points clés (symétriques autour de x=256)
    St = (256, 292)     # haut de reliure (vallée centrale)
    Sb = (256, 452)     # bas de reliure (point le plus bas)
    # coin haut / bas extérieurs (page gauche)
    Lt = (84, 250)
    Lb = (98, 404)

    def page(sign):
        """sign=-1 page gauche, +1 page droite (miroir en x)."""
        def X(x):
            return 256 + sign * (x - 256)
        d = (
            f'M {X(St[0])} {St[1]} '
            f'C {X(196)} 272 {X(132)} 254 {X(Lt[0])} {Lt[1]} '   # bord haut -> coin haut
            f'C {X(88)} 300 {X(90)} 356 {X(Lb[0])} {Lb[1]} '     # bord extérieur -> coin bas
            f'C {X(150)} 422 {X(208)} 438 {X(Sb[0])} {Sb[1]} '   # bord bas -> reliure bas
            f'L {X(256)} {St[1]} Z'                              # reliure (centre)
        )
        return d

    def page_lines(sign):
        """Tranches : fines courbes dorées sous le bord bas de chaque page."""
        def X(x):
            return 256 + sign * (x - 256)
        lines = []
        for off in (10, 19, 28):
            lines.append(
                f'<path d="M {X(108)} {404 + off - 4} '
                f'C {X(152)} {422 + off} {X(210)} {438 + off} {X(254)} {452 + off}" '
                f'fill="none" stroke="{GOLD}" stroke-width="3" '
                f'stroke-linecap="round" opacity="{1 - off/46:.2f}"/>'
            )
        return "\n      ".join(lines)

    return f'''
    <!-- couverture dorée (déborde sous les pages) -->
    <g transform="translate(0,9)">
      <path d="{page(-1)}" fill="{GOLD}"/>
      <path d="{page(1)}"  fill="{GOLD}"/>
    </g>
    <!-- tranches des pages -->
    <g>
      {page_lines(-1)}
      {page_lines(1)}
    </g>
    <!-- pages blanches -->
    <path d="{page(-1)}" fill="{WHITE}" stroke="{NAVY}" stroke-width="5" stroke-linejoin="round"/>
    <path d="{page(1)}"  fill="{WHITE}" stroke="{NAVY}" stroke-width="5" stroke-linejoin="round"/>
    <!-- reliure centrale -->
    <path d="M 256 292 L 256 452" stroke="{NAVY}" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="256" cy="452" rx="15" ry="9" fill="{GOLD}" stroke="{NAVY}" stroke-width="4"/>'''


def cor():
    """Les trois lettres « COR » posées sur les pages (O doré)."""
    common = (f'font-family="{SERIF}" font-size="140" font-weight="700" '
              f'text-anchor="middle" dominant-baseline="alphabetic"')
    y = 400
    return (
        f'<text x="150" y="{y}" {common} fill="{NAVY}">C</text>'
        f'<text x="256" y="{y}" {common} fill="{GOLD}">O</text>'
        f'<text x="362" y="{y}" {common} fill="{NAVY}">R</text>'
    )


def badge(maskable=False):
    """SVG complet du badge (512×512). maskable : fond plein + contenu réduit."""
    radius = 0 if maskable else 86
    # contenu réduit dans la zone de sécurité pour la variante maskable
    wrap_open = '<g transform="translate(256,256) scale(0.80) translate(-256,-256)">' if maskable else ''
    wrap_close = '</g>' if maskable else ''
    frame = '' if maskable else (
        f'<rect x="22" y="22" width="468" height="468" rx="64" '
        f'fill="none" stroke="{GOLD}" stroke-width="6"/>'
        f'<rect x="33" y="33" width="446" height="446" rx="54" '
        f'fill="none" stroke="{GOLD}" stroke-width="2" opacity="0.55"/>'
    )
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="Ceci est mon COR">
  <defs>
    <radialGradient id="bg" cx="50%" cy="34%" r="78%">
      <stop offset="0%" stop-color="#1d3565"/>
      <stop offset="100%" stop-color="{NAVY_DEEP}"/>
    </radialGradient>
    <path id="titleArc" d="M 104 150 Q 256 78 408 150" fill="none"/>
  </defs>
  <rect width="512" height="512" rx="{radius}" fill="url(#bg)"/>
  {frame}
  {wrap_open}
    <!-- halo de rayons -->
    <g fill="{GOLD}" opacity="0.92">
      {sunburst(256, 268)}
    </g>
    <!-- titre courbé -->
    <text font-family="{SERIF}" font-size="44" fill="{WHITE}"
          text-anchor="middle" letter-spacing="1.5">
      <textPath href="#titleArc" startOffset="50%">Ceci est mon</textPath>
    </text>
    {book()}
    {cor()}
  {wrap_close}
</svg>'''


SANS = "DejaVu Sans, Liberation Sans, Arial, sans-serif"


def og_image():
    """Carte de partage 1200×630 : titre, chiffres-clés et le logo à droite."""
    # logo (badge) imbriqué et positionné à droite
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
  <circle cx="998" cy="310" r="174" fill="none" stroke="#c89b3e" stroke-opacity="0.30" stroke-width="2"/>
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

    try:
        import cairosvg
    except ImportError:
        print("cairosvg absent : SVG écrit, PNG non régénérés (pip install cairosvg).")
        return

    for size in (192, 512):
        # fond opaque (= bord du dégradé) : évite les coins transparents que
        # iOS comblerait en noir pour l'apple-touch-icon.
        cairosvg.svg2png(bytestring=svg.encode(), write_to=os.path.join(out_dir, f"icon-{size}.png"),
                         output_width=size, output_height=size, background_color=NAVY_DEEP)
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
