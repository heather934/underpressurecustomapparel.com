# mtr-doc-merger

A local command-line tool that, given an invoice number and a list of Heat
Numbers, finds the matching Mill Test Report (MTR) PDFs in a shared Google
Drive folder, blanks out the customer/order/shipping-chain fields that
shouldn't go out to your customer (Sold To, Ship To, PO/order/B-L/shipper/
invoice numbers, issuing dates, etc.), and merges everything into one file:
`<invoice number> MTRs.pdf`.

It only touches known document layouts ("templates"). Layouts it doesn't
recognize are left un-redacted and clearly flagged so you never accidentally
send out a document nobody has checked -- you then give it a hand-edited
sample of the new layout and it learns the rule from the diff.

## How it decides what to redact

Every supported mill/broker PDF layout has a JSON file under `templates/`
describing:
- a handful of phrases that must all appear on the page to identify the
  layout ("detect_all_of")
- a list of rectangles (in PDF point coordinates) to permanently blank out
  ("redact_rects")

Redaction uses PyMuPDF's real redaction feature (not a cosmetic overlay) --
both the underlying text objects and any image pixels in each rectangle are
actually removed, not just painted over.

Redacted fields are simply left blank in place (no attempt to reflow the
rest of the page around the gap). This is a deliberate tradeoff: matching a
human's hand-retouched layout exactly isn't something a script can do
reliably, but functionally-equivalent redaction (same fields gone, rest of
the document untouched) is.

## Setup

```bash
cd mtr-doc-merger
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

### Google Drive access (only needed for `build`)

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or
   reuse) a project, enable the **Google Drive API**, and create an
   **OAuth client ID** of type **Desktop app** (APIs & Services >
   Credentials).
2. Download the client secret JSON and save it as
   `~/.mtr_merger/client_secret.json`.
3. The first time you run `build`, a browser window opens asking you to sign
   in and approve read-only Drive access. After that, a token is cached at
   `~/.mtr_merger/token.json` and refreshed automatically -- you won't be
   prompted again unless you revoke access.

`redact` and `learn` don't touch Google Drive at all and need none of this.

## Usage

**Merge MTRs for an invoice, straight from Drive:**

```bash
python3 -m mtr_merger.cli build \
  --invoice 12345 \
  --heats 4181794 6602127 3600052696 B5L689 \
  --drive-folder "https://drive.google.com/drive/folders/XXXXXXXXXXXX"
```

Writes `12345 MTRs.pdf` to the current directory. For each heat number, it
searches the given folder (and its subfolders) by filename first, then by
Drive's full-text search (which also indexes scanned/OCR'd PDFs) if nothing
matches by name. If a heat number isn't found, or a matched file has pages
in an unrecognized layout, the tool tells you clearly and still writes the
merged file with whatever it could redact -- review the output before
sending it.

**Redact a single PDF you already have locally:**

```bash
python3 -m mtr_merger.cli redact input.pdf output.pdf
```

**Teach it a new mill/broker layout:**

When `redact` or `build` reports a page with no matching template, manually
edit one example the way you want it (in Acrobat, Preview, whatever you'd
normally use), then:

```bash
python3 -m mtr_merger.cli learn \
  --original original.pdf \
  --edited edited.pdf \
  --id acme_steel_mtr \
  --name "Acme Steel - Mill Test Report" \
  --detect "ACME STEEL" "Mill Test Report"
```

This diffs the two PDFs and prints every region it thinks you removed, with
a text preview of what was in it, so you can sanity-check nothing you
wanted to *keep* (heat number, chemistry, mechanical properties, signature)
got swept in. `--detect` should be one or more short phrases that reliably
appear on this layout and no other -- run without `--save` first to review,
then re-run with `--save` once the rect list looks right.

Note: this diff-based learning only works well when the source PDF has a
real, selectable text layer (most "print to PDF" documents). For a fully
scanned/flattened layout (no text layer at all beyond maybe a stamp), the
diff can't see the removed content and you'll need to hand-pick the
rectangles by rendering the page at high zoom and reading off coordinates --
see `templates/nucor_mill_certification_broker.json` for a worked example
and its `notes` field for how it was derived.

**List known templates:**

```bash
python3 -m mtr_merger.cli list-templates
```

## Notes on what gets kept vs. redacted

The rule of thumb used across the built-in templates: keep everything that
certifies the *material* (heat number, chemistry, mechanical test results,
description/spec, the certifying statement and signature, and the
identity of whichever party actually produced the steel), and blank
everything that's part of the *trade chain* (who bought it, who sold it to
whom, PO/order/shipper/invoice/B-L numbers, ship dates, addresses of
resellers/brokers passing the document along). Always spot-check a new
template's output before relying on it -- especially the scanned/broker-
stamped one, which is best-effort (see its `notes` field).
