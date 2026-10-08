# ECDICT subset for Glint

Source: [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT/tree/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b).
The upstream repository supplies the data under its [MIT license](LICENSE), retained verbatim here and in builds.

`entries.json.gz` contains 58,226 single-word entries derived from `ecdict.csv` at
the pinned revision. The selection retains Chinese definitions, phonetics and
attested inflections for words tagged for exams, in the top 50,000 BNC/FRQ ranks,
or marked with Collins stars / the Oxford core flag. Only ASCII word heads with
internal apostrophes or hyphens are included. Metadata flags are used for
selection; no publisher affiliation or endorsement is implied. This is a
curated subset, not the full upstream dictionary. Definitions are not rewritten;
quality, age and coverage vary, and no examples or audio are invented.

`manifest.json` records revision, source checksum, compressed checksum and count.
To reproduce, download that revision's `ecdict.csv` into ignored `work/`, then run:

```
python scripts/import-dictionary.py work/dictionary/ecdict.csv
```

Normal npm builds need neither Python for this data step nor a network download:
`scripts/dictionary.mjs` checks the vendored checksum and creates the indexed,
read-only runtime database in `dist/dictionary/`. Packaging copies it outside
ASAR to `resources/dictionary/`; it is never stored among user history databases.
Runtime lookups open the database lazily with a bounded SQLite page cache.

Exact spelling takes precedence over case folding. Missing words may resolve via
unambiguous inflections explicitly listed by the dictionary; no suffix guessing
is used. Unknown words and ambiguous forms fall back to the configured model.
