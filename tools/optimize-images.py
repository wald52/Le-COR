#!/usr/bin/env python3
"""Génère des versions WebP redimensionnées des photos de cartes du carousel.

Pourquoi : les photos pleine carte sont l'élément LCP (Largest Contentful Paint)
de la page d'accueil. Les sources JPEG sont surdimensionnées (jusqu'à 2048 px de
large) et dans un format ancien. Affichées dans un emplacement d'environ ~500 px,
elles pèsent inutilement lourd et plombent le score performance Lighthouse.

Ce script produit, à côté de chaque JPEG, un WebP redimensionné (largeur max
MAX_WIDTH, qualité QUALITY) qui est servi à la place du JPEG par `js/cards.js`.
Les `.webp` générés sont committés (le site n'a pas d'étape de build, comme les
PNG d'icônes produits par `icons/make_icons.py`).

Réexécuter après toute retouche d'une photo :  python3 tools/optimize-images.py
Dépendance : Pillow avec support WebP  (pip install Pillow).
"""
import os
import sys

from PIL import Image

# Photos de cartes converties (cf. js/cards.js, champ `photo`). `explorer-cards.svg`
# est exclu : déjà vectoriel et léger.
PHOTOS = [
    "intro-cor.jpg",
    "bayrou.jpg",
    "hypotheses-cockpit.jpg",
    "simulateur-faders.jpg",
    "sources-logos.jpg",
]

# Largeur d'affichage max ~500 px CSS ; on garde une marge pour les écrans à forte
# densité (DPR ~2) sans repartir des 1600–2048 px d'origine.
MAX_WIDTH = 900
QUALITY = 80

IMAGES_DIR = os.path.join(os.path.dirname(__file__), os.pardir, "images")


def convert(name):
    src = os.path.join(IMAGES_DIR, name)
    dst = os.path.splitext(src)[0] + ".webp"
    with Image.open(src) as im:
        im = im.convert("RGB")
        if im.width > MAX_WIDTH:
            height = round(im.height * MAX_WIDTH / im.width)
            im = im.resize((MAX_WIDTH, height), Image.LANCZOS)
        im.save(dst, "WEBP", quality=QUALITY, method=6)
    before = os.path.getsize(src)
    after = os.path.getsize(dst)
    print(f"{name:28} {before // 1024:4} Ko → {os.path.basename(dst):28} "
          f"{after // 1024:4} Ko  ({im.width}px)")


def main():
    for name in PHOTOS:
        path = os.path.join(IMAGES_DIR, name)
        if not os.path.exists(path):
            print(f"⚠ introuvable : {name}", file=sys.stderr)
            continue
        convert(name)


if __name__ == "__main__":
    main()
