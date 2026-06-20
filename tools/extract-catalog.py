#!/usr/bin/env python3
"""Extract lightweight archery gear candidates from catalog PDFs.

The app stays dependency-free. This helper is a development tool that uses
PyMuPDF from the local Python venv to refresh product-name candidates before
curating them into index.html.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from pathlib import Path

import fitz


BRANDS = [
    "HOYT",
    "WIN&WIN",
    "WIAWIS",
    "MK KOREA",
    "MK",
    "WNS",
    "KINETIC",
    "FIVICS",
    "SAMICK",
    "SHIBUYA",
    "BEITER",
    "EASTON",
    "AXCEL",
    "AVALON",
    "CARTEL",
    "SPIGARELLI",
    "AAE",
    "BCY",
    "MATHEWS",
    "PSE",
    "T.R.U BALL",
    "TRU BALL",
    "STAN",
    "SKYLON",
    "BLACK EAGLE",
]

CATEGORIES = {
    "bow": ("RISERS", "ハンドル", "BOWS", "ベアボウ"),
    "limbs": ("LIMBS", "リム"),
    "sight": ("SIGHTS", "サイト", "SCOPES", "スコープ"),
    "rest": ("REST", "レスト"),
    "plunger": ("PLUNGER", "プランジャー"),
    "stabilizer": ("STABILIZERS", "スタビライザー", "RODS", "V バー", "WEIGHTS"),
    "string": ("STRING", "ストリング"),
    "arrow": ("ARROWS", "アロー", "シャフト", "NOCK", "ノック", "VANE", "ベイン"),
    "tab": ("TABS", "タブ", "RELEASE", "リリーサー"),
}

DROP_WORDS = (
    "PRODUCT",
    "GUIDE",
    "CONTENTS",
    "本体価格",
    "税込",
    "対応モデル",
    "サイズ",
    "特徴",
    "材質",
    "カラー",
)


def compact(text: str) -> str:
    text = text.replace("\u3000", " ")
    return re.sub(r"\s+", " ", text).strip()


def category_for(text: str) -> str:
    up = text.upper()
    for category, words in CATEGORIES.items():
        if any(w.upper() in up for w in words):
            return category
    return "misc"


def extract_candidates(pdf: Path) -> dict:
    doc = fitz.open(pdf)
    brand_pattern = "|".join(re.escape(b) for b in sorted(BRANDS, key=len, reverse=True))
    phrase_re = re.compile(
        rf"(?<![A-Z0-9])(?:{brand_pattern})"
        r"(?:\s+[A-Z0-9][A-Z0-9&/\.\-＋+]*|\s+[ァ-ヴー一-龥A-Za-z0-9][^¥\[\]\(\)\n]{0,18}){0,5}",
        re.IGNORECASE,
    )

    by_key: dict[str, dict] = {}
    for page_no, page in enumerate(doc, start=1):
        text = compact(page.get_text("text"))
        cat = category_for(text)
        for match in phrase_re.finditer(text):
            phrase = compact(match.group(0)).strip(" ・/,:;")
            if len(phrase) < 4 or len(phrase) > 70:
                continue
            if any(word in phrase for word in DROP_WORDS):
                continue
            key = phrase.upper()
            item = by_key.setdefault(
                key,
                {"name": phrase, "category": cat, "pages": [], "hits": 0},
            )
            item["pages"].append(page_no)
            item["hits"] += 1
            if item["category"] == "misc" and cat != "misc":
                item["category"] = cat

    grouped = defaultdict(list)
    for item in by_key.values():
        item["pages"] = sorted(set(item["pages"]))
        grouped[item["category"]].append(item)

    return {
        "source": str(pdf),
        "pages": doc.page_count,
        "categories": {
            cat: sorted(items, key=lambda x: (x["pages"][0], x["name"].upper()))
            for cat, items in sorted(grouped.items())
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("artifacts/catalog/catalog-extract.json"),
    )
    args = parser.parse_args()

    data = extract_candidates(args.pdf)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    total = sum(len(v) for v in data["categories"].values())
    cats = ", ".join(f"{k}:{len(v)}" for k, v in data["categories"].items())
    print(f"extracted {total} candidates from {data['pages']} pages -> {args.out}")
    print(cats)


if __name__ == "__main__":
    main()
