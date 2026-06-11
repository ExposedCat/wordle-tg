#!/usr/bin/env python3
"""Generate length-specific Wordle dictionaries from wordfreq.

The output is one JSON file per language and word length, for example:

    data/wordfreq/en-5.json
    data/wordfreq/ru-6.json

Each file contains:

    valid    - all words from the selected wordfreq wordlist for that language
    possible - the most common words for that language/length, capped by limit

Install the generator dependency with:

    python -m pip install wordfreq
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from collections.abc import Iterable
from pathlib import Path


LANGUAGE_PATTERNS = {
    "en": re.compile(r"^[a-z]+$"),
    "ru": re.compile(r"^[а-яё]+$"),
}


def normalize_word(word: str) -> str:
    return unicodedata.normalize("NFC", word.strip().lower())


def length_bucket(
    word: str,
    *,
    language: str,
    min_length: int,
    max_length: int,
) -> int | None:
    normalized = normalize_word(word)
    if not LANGUAGE_PATTERNS[language].fullmatch(normalized):
        return None
    length = len(normalized)
    if min_length <= length <= max_length:
        return length
    return None


def iter_words(language: str, wordlist: str) -> Iterable[str]:
    try:
        from wordfreq import iter_wordlist
    except ImportError:
        print(
            "Missing Python dependency: wordfreq\n"
            "Install it with: python -m pip install wordfreq",
            file=sys.stderr,
        )
        raise SystemExit(1)

    return iter_wordlist(language, wordlist=wordlist)


def collect_words(
    *,
    language: str,
    min_length: int,
    max_length: int,
    possible_limit: int,
    wordlist: str,
) -> dict[int, dict[str, list[str]]]:
    words = {
        length: {"valid": [], "possible": []}
        for length in range(min_length, max_length + 1)
    }
    seen_valid = {length: set() for length in words}
    seen_possible = {length: set() for length in words}

    for raw_word in iter_words(language, wordlist):
        word = normalize_word(raw_word)
        length = length_bucket(
            word,
            language=language,
            min_length=min_length,
            max_length=max_length,
        )
        if length is None:
            continue

        if word not in seen_valid[length]:
            seen_valid[length].add(word)
            words[length]["valid"].append(word)

        if len(words[length]["possible"]) < possible_limit and word not in seen_possible[length]:
            seen_possible[length].add(word)
            words[length]["possible"].append(word)

    return words


def write_json(
    *,
    out_dir: Path,
    language: str,
    length: int,
    wordlist: str,
    possible_limit: int,
    words: dict[str, list[str]],
    pretty: bool,
) -> None:
    payload = {
        "language": language,
        "length": length,
        "source": {
            "package": "wordfreq",
            "wordlist": wordlist,
            "possibleLimit": possible_limit,
            "note": "valid is the filtered wordfreq wordlist; possible is the first N matching words in frequency order.",
        },
        "valid": words["valid"],
        "possible": words["possible"],
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_file = out_dir / f"{language}-{length}.json"
    json_kwargs = {"ensure_ascii": False}
    if pretty:
        json_kwargs.update({"indent": 2})
    out_file.write_text(json.dumps(payload, **json_kwargs) + "\n", encoding="utf-8")
    print(
        f"wrote {out_file} "
        f"({len(words['valid'])} valid, {len(words['possible'])} possible)"
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate 3-10 letter en/ru Wordle JSON dictionaries from wordfreq.",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=Path("data/wordfreq"),
        help="Directory to write JSON files into.",
    )
    parser.add_argument(
        "--languages",
        nargs="+",
        choices=sorted(LANGUAGE_PATTERNS),
        default=["en", "ru"],
        help="Languages to generate.",
    )
    parser.add_argument(
        "--min-length",
        type=int,
        default=3,
        help="Smallest word length to include.",
    )
    parser.add_argument(
        "--max-length",
        type=int,
        default=10,
        help="Largest word length to include.",
    )
    parser.add_argument(
        "--possible-limit",
        type=int,
        default=15_000,
        help="Maximum number of possible answer words per language/length.",
    )
    parser.add_argument(
        "--wordlist",
        default="large",
        help="wordfreq wordlist to use for valid words and answer candidates.",
    )
    parser.add_argument(
        "--pretty",
        action="store_true",
        help="Pretty-print JSON output.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.min_length < 1:
        raise SystemExit("--min-length must be at least 1")
    if args.max_length < args.min_length:
        raise SystemExit("--max-length must be greater than or equal to --min-length")
    if args.possible_limit < 1:
        raise SystemExit("--possible-limit must be at least 1")

    for language in args.languages:
        by_length = collect_words(
            language=language,
            min_length=args.min_length,
            max_length=args.max_length,
            possible_limit=args.possible_limit,
            wordlist=args.wordlist,
        )
        for length, words in by_length.items():
            write_json(
                out_dir=args.out_dir,
                language=language,
                length=length,
                wordlist=args.wordlist,
                possible_limit=args.possible_limit,
                words=words,
                pretty=args.pretty,
            )


if __name__ == "__main__":
    main()
