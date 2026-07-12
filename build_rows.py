#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_rows.py — Baut die vier brühl-Reihen piano, roro, moule, four-two
in index.html nach dem alba-Muster auf.

Vorgehen pro Reihe:
  1. Bilddateien aus assets/img/bruehl/<reihe>/ einlesen (sorted).
  2. Je Datei einem Möbeltyp zuordnen (erstes Match gewinnt).
  3. Eine <section> erzeugen: Kopfblock + Hero + optional Vimeo + Galerie
     je Möbeltyp (>4 Bilder -> Akkordeon, <=4 -> direktes Raster).
  4. Bereich zwischen den Markern <!-- SEC:REIHE:START --> ... :END -->
     ersetzen (Marker bleiben). Andere Sektionen werden nicht angetastet.

Idempotent: mehrfaches Ausführen liefert dasselbe Ergebnis.
"""

import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
IMG_ROOT = os.path.join(BASE, "assets", "img", "bruehl")
INDEX = os.path.join(BASE, "index.html")

IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")

# Anzeigereihenfolge der Gruppen; leere Gruppen werden weggelassen.
GROUP_ORDER = [
    "Sofas",
    "Ecksofas",
    "Chaiselongue",
    "Sessel",
    "Daybed & Liege",
    "Schlafsofa",
    "Sonstige",
]

# Typ-Singular für alt-Texte.
SINGULAR = {
    "Sofas": "Sofa",
    "Ecksofas": "Ecksofa",
    "Chaiselongue": "Chaiselongue",
    "Sessel": "Sessel",
    "Daybed & Liege": "Daybed",
    "Schlafsofa": "Schlafsofa",
    "Sonstige": "Detail",
}

# Kopfblock je Reihe (Texte wörtlich aus dem Auftrag).
ROWS_CFG = {
    "piano": {
        "eyebrow": "Modell im Fokus · piano",
        "h2": "piano",
        "designer": "Design Kati Meyer-Brühl &amp; Roland Meyer-Brühl",
        "body": [
            '<p class="body-text reveal">Ruhige Flächen, sanft gerundete Konturen, bodennahe Basis: piano wirkt großzügig und leicht zugleich. Die geteilte Liegefläche lässt zwei Menschen ungestört ruhen — abgesenkte Rückenlehnen verlängern sie zusätzlich.</p>',
            '<p class="body-text reveal">Kopfpolster stecken in einer fast unsichtbaren Fuge der Lehnen; optional gibt es Reling-Seitenlehne, Armlehnen und eine zweite Rückenlehne fürs Drehsofa. Dazu Zierkissen mit Knopfheftung — und wie immer bei brühl abziehbare, erneuerbare Bezüge.</p>',
        ],
        "cta": "Im Showroom probeliegen",
        "hero_alt": "piano von brühl als Ecksofa",
        "vimeo": {
            "id": "1156809923",
            "hash": "78051002ef",
            "ratio": "3/2",
            "title": "piano — Animation",
            "caption": "piano in Bewegung — vom Sofa zur Liegefläche",
        },
    },
    "roro": {
        "eyebrow": "Modell im Fokus · roro",
        "h2": "roro",
        "designer": "Design Roland Meyer-Brühl",
        "body": [
            '<p class="body-text reveal">Das wandelbare Programm, das sich in Sekunden verwandelt: Arm- und Rückenlehnen lassen sich stufenweise neigen — vom aufrechten Sitzen über die entspannte Lounge-Position bis zur vollwertigen Liegefläche. Als Sofa, Ecksofa, Sessel, Chaiselongue oder Daybed.</p>',
            '<p class="body-text reveal">Das filigrane Gestell lässt die weichen Kissen optisch schweben. Abziehbare Bezüge in Leder oder Stoff machen roro zum Begleiter für Jahrzehnte — gefertigt in Bad Steben, ausgezeichnet mit dem Blauen Engel.</p>',
        ],
        "cta": "Im Showroom probesitzen",
        "hero_alt": "roro von brühl als Ecksofa",
        "vimeo": {
            "id": "1166270195",
            "hash": "b04c9916af",
            "ratio": "3/2",
            "title": "roro — Animation der Verwandlung",
            "caption": "roro in Bewegung — vom Ecksofa zur Liegelandschaft",
        },
    },
    "moule": {
        "eyebrow": "Modell im Fokus · moule",
        "h2": "moule",
        "designer": "Design Roland Meyer-Brühl",
        "body": [
            '<p class="body-text reveal">Einzeln verstellbare Drehsitze, weiche Rundkissen und dieselbe leichtgängige Verwandlung vom Sofa zur Liegefläche — in der ganzen Bandbreite der brühl-Bezüge. Als kompaktes Sofa, luftige Eckformation aus Longchair und Anstellsofa oder großzügige Wohnlandschaft.</p>',
            '<p class="body-text reveal">Durch Absenken aller Lehnen wird daraus eine plane Liegefläche; Ablageflächen und Bezüge sind individuell konfigurierbar und stets abziehbar und erneuerbar.</p>',
        ],
        "cta": "Im Showroom probesitzen",
        "hero_alt": "moule von brühl als Ecksofa",
        "vimeo": None,
    },
    "four-two": {
        "eyebrow": "Modell im Fokus · four-two",
        "h2": "four-two",
        "designer": "Design Roland Meyer-Brühl",
        "body": [
            '<p class="body-text reveal">Eine kompakte Ecklösung mit Platz für vier, eine gemütliche Lounge-Landschaft oder ein bequemes Doppelbett. Das Drehsofa kann rechts oder links ausgerichtet sein; unter der Armlehne verbirgt sich eine Tischablagefläche.</p>',
            '<p class="body-text reveal">Die Armlehne am Longchair wird vorgezogen zur zusätzlichen Rückenlehne. Kopfstützen und Tischmodule machen four-two auch als Bett noch komfortabler — Untergestell in Metall oder Holz, Bezüge in Textil oder Leder, stets abziehbar und erneuerbar.</p>',
        ],
        "cta": "Im Showroom probeliegen",
        "hero_alt": "four-two von brühl als Ecksofa",
        "vimeo": {
            "id": "724494860",
            "hash": "2082ee526c",
            "ratio": "16/9",
            "title": "four-two — Design Roland Meyer-Brühl",
            "caption": "four-two in Bewegung — Ecksofa, Lounge und Doppelbett",
        },
    },
}


def slug(group):
    """kebab-case eines Gruppennamens (z. B. 'Daybed & Liege' -> 'daybed-liege')."""
    return re.sub(r"[^a-z0-9]+", "-", group.lower()).strip("-")


def classify(filename):
    """Weist eine Datei ihrem Möbeltyp zu (erstes Match gewinnt)."""
    n = filename.lower()
    if "schlafofa" in n or "schlafsofa" in n:
        return "Schlafsofa"
    if "ecksofa" in n:
        return "Ecksofas"
    if "chaiselong" in n or "longchair" in n:
        return "Chaiselongue"
    if "einzelsessel" in n or "sessel" in n:
        return "Sessel"
    if "daybed" in n or "liege" in n:
        return "Daybed & Liege"
    if "sofa" in n:
        return "Sofas"
    return "Sonstige"


def load_groups(row):
    """Liest die Bilder einer Reihe und gruppiert sie nach Möbeltyp."""
    folder = os.path.join(IMG_ROOT, row)
    files = sorted(
        f for f in os.listdir(folder) if f.lower().endswith(IMG_EXT)
    )
    groups = {g: [] for g in GROUP_ORDER}
    for f in files:
        groups[classify(f)].append(f)
    return groups


def pick_hero_group(groups):
    """Hero-Gruppe: Ecksofas, sonst Sofas, sonst erste nicht-leere Gruppe."""
    for name in ("Ecksofas", "Sofas"):
        if groups.get(name):
            return name
    for name in GROUP_ORDER:
        if groups.get(name):
            return name
    return None


def img_path(row, filename):
    return "assets/img/bruehl/{}/{}".format(row, filename)


def accordion_block(row, group, files):
    """> 4 Bilder -> eingeklapptes Akkordeon."""
    n = len(files)
    panel_id = "panel-{}-{}".format(row, slug(group))
    title = "Kollektion {0} — {1}".format(row, group)
    singular = SINGULAR[group]
    L = []
    L.append(
        '      <button type="button" class="collection-toggle reveal" '
        'data-collection-toggle aria-expanded="false" '
        'aria-controls="{pid}" data-label-open="Ausblenden" '
        'data-label-closed="{n} Ansichten anzeigen" style="margin-top:20px">'.format(
            pid=panel_id, n=n
        )
    )
    L.append('        <span class="collection-toggle__label">')
    L.append('          <span class="collection-toggle__title">{}</span>'.format(title))
    L.append(
        '          <span class="collection-toggle__count" '
        'data-collection-count>{} Ansichten anzeigen</span>'.format(n)
    )
    L.append('        </span>')
    L.append('        <span class="collection-toggle__chevron" aria-hidden="true">⌄</span>')
    L.append('      </button>')
    L.append(
        '      <div class="collection-panel" id="{pid}" inert aria-hidden="true">'.format(pid=panel_id)
    )
    L.append('        <div class="collection-panel__inner">')
    L.append('          <div class="collection-panel__grid">')
    for i, f in enumerate(files, 1):
        alt = "{0} {1} von brühl, Ansicht {2}".format(row, singular, i)
        L.append('            <figure class="product-media gallery-item" data-hover-video="">')
        L.append('              <img src="{src}" alt="{alt}" loading="lazy">'.format(
            src=img_path(row, f), alt=alt))
        L.append('            </figure>')
    L.append('          </div>')
    L.append('        </div>')
    L.append('      </div>')
    return "\n".join(L)


def grid_block(row, group, files):
    """<= 4 Bilder -> direktes Raster mit Überschrift."""
    singular = SINGULAR[group]
    L = []
    L.append('      <div style="margin-top:56px">')
    L.append('        <p class="eyebrow reveal" style="text-align:center">{0} · {1}</p>'.format(row, group))
    L.append(
        '        <h3 class="heading reveal" '
        'style="text-align:center;font-size:clamp(28px,3vw,40px);'
        'margin-bottom:24px">{}</h3>'.format(group)
    )
    L.append('        <div class="gallery-grid">')
    for i, f in enumerate(files, 1):
        alt = "{0} {1} von brühl, Ansicht {2}".format(row, singular, i)
        L.append('          <figure class="product-media gallery-item" data-hover-video="">')
        L.append('            <img src="{src}" alt="{alt}" loading="lazy">'.format(
            src=img_path(row, f), alt=alt))
        L.append('          </figure>')
    L.append('        </div>')
    L.append('      </div>')
    return "\n".join(L)


def vimeo_block(row, v, poster_src):
    L = []
    L.append('')
    L.append('      <div class="feature-video reveal-media">')
    L.append(
        '        <div class="vimeo-embed" data-vimeo="{id}" '
        'data-vimeo-hash="{hash}" data-vimeo-title="{title}">'.format(
            id=v["id"], hash=v["hash"], title=v["title"]
        )
    )
    L.append(
        '          <div class="vimeo-embed__frame-wrap" '
        'style="--vimeo-ratio:{ratio}" data-vimeo-frame-wrap>'.format(ratio=v["ratio"])
    )
    L.append(
        "            <button type=\"button\" class=\"vimeo-embed__poster\" "
        "data-vimeo-poster style=\"background-image:url('{src}')\" "
        'aria-label="Video laden: {title}">'.format(src=poster_src, title=v["title"])
    )
    L.append('              <span class="vimeo-embed__play" aria-hidden="true">►</span>')
    L.append('              <span class="vimeo-embed__label">Video von Vimeo laden</span>')
    L.append('            </button>')
    L.append('          </div>')
    L.append('        </div>')
    L.append('        <p class="media-caption">{}</p>'.format(v["caption"]))
    L.append('      </div>')
    return "\n".join(L)


def build_section(row, groups):
    cfg = ROWS_CFG[row]
    hero_group = pick_hero_group(groups)
    hero_file = groups[hero_group][0]
    hero_src = img_path(row, hero_file)

    # Poster = zweites Bild der Hero-Gruppe, sonst Hero-Bild.
    hero_files = groups[hero_group]
    poster_file = hero_files[1] if len(hero_files) >= 2 else hero_file
    poster_src = img_path(row, poster_file)

    L = []
    L.append('    <section class="section" id="{}">'.format(row))
    L.append('      <div class="model-row">')
    L.append('        <div>')
    L.append('          <p class="eyebrow reveal">{}</p>'.format(cfg["eyebrow"]))
    L.append('          <h2 class="heading reveal">{}</h2>'.format(cfg["h2"]))
    L.append('          <p class="designer reveal">{}</p>'.format(cfg["designer"]))
    for p in cfg["body"]:
        L.append('          {}'.format(p))
    L.append('          <a href="#kontakt" class="btn btn--dark reveal">{}</a>'.format(cfg["cta"]))
    L.append('        </div>')
    L.append('        <figure class="product-media product-media--hero reveal-media" data-hover-video="">')
    L.append('          <img src="{src}" alt="{alt}" loading="lazy">'.format(
        src=hero_src, alt=cfg["hero_alt"]))
    L.append('        </figure>')
    L.append('      </div>')

    if cfg.get("vimeo"):
        L.append(vimeo_block(row, cfg["vimeo"], poster_src))

    for group in GROUP_ORDER:
        files = groups.get(group, [])
        if not files:
            continue
        L.append("")  # Leerzeile zwischen Blöcken
        if len(files) > 4:
            L.append(accordion_block(row, group, files))
        else:
            L.append(grid_block(row, group, files))

    L.append('    </section>')
    return "\n".join(L)


def replace_section(content, row, section_html):
    """Ersetzt den Inhalt zwischen den Markern (Marker bleiben erhalten)."""
    marker = row.upper()  # piano->PIANO, four-two->FOUR-TWO
    start = "<!-- SEC:{}:START -->".format(marker)
    end = "<!-- SEC:{}:END -->".format(marker)
    pattern = re.compile(re.escape(start) + r".*?" + re.escape(end), re.DOTALL)
    if not pattern.search(content):
        raise RuntimeError("Marker nicht gefunden für Reihe {!r}".format(row))
    replacement = start + "\n" + section_html + "\n\n    " + end
    return pattern.sub(lambda m: replacement, content)


def main():
    with open(INDEX, "r", encoding="utf-8") as fh:
        content = fh.read()

    print("=" * 60)
    print("build_rows.py — Gruppierung je Reihe")
    print("=" * 60)

    for row in ROWS_CFG:
        groups = load_groups(row)
        total = sum(len(v) for v in groups.values())
        present = len(sorted(
            f for f in os.listdir(os.path.join(IMG_ROOT, row))
            if f.lower().endswith(IMG_EXT)
        ))
        print("\n## {}  (Bilder: {})".format(row, total))
        for group in GROUP_ORDER:
            files = groups.get(group, [])
            if not files:
                continue
            kind = "Akkordeon" if len(files) > 4 else "Raster   "
            hero_group = pick_hero_group(groups)
            print("   - {kind}  {grp:18s} {n:3d}  ".format(
                kind=kind, grp=group, n=len(files)))
        print("   Hero-Gruppe: {} -> {}".format(hero_group, groups[hero_group][0]))
        assert total == present, "Zählfehler {}: {} != {}".format(row, total, present)
        content = replace_section(content, row, build_section(row, groups))

    with open(INDEX, "w", encoding="utf-8") as fh:
        fh.write(content)
    print("\n" + "=" * 60)
    print("index.html aktualisiert.")
    print("=" * 60)


if __name__ == "__main__":
    main()
