"""Command-line entry point.

    mtr-merger build --invoice 12345 --heats 4181794 6602127 --drive-folder <url>
    mtr-merger redact input.pdf output.pdf
    mtr-merger learn --original orig.pdf --edited edited.pdf --id my_mill --name "My Mill" --detect "PHRASE"
    mtr-merger list-templates
"""
from __future__ import annotations

import argparse
import sys
import tempfile
from pathlib import Path

from .learn import learn_template
from .redact import merge_pdfs, redact_pdf
from .templates import load_templates, save_template


def cmd_list_templates(args: argparse.Namespace) -> int:
    templates = load_templates()
    if not templates:
        print("No templates learned yet. Use `learn` to add one.")
        return 0
    for t in templates:
        print(f"- {t.id}: {t.display_name} ({len(t.redact_rects)} redaction rects)")
        print(f"    detect: {t.detect_all_of}")
    return 0


def cmd_redact(args: argparse.Namespace) -> int:
    result = redact_pdf(args.input, args.output)
    for page in result.pages:
        if page.template_id:
            print(f"page {page.page_index}: matched '{page.template_name}' -> redacted")
        else:
            print(f"page {page.page_index}: NO TEMPLATE MATCHED -- left untouched, please review")
    if result.unmatched_pages:
        print(
            f"\n{len(result.unmatched_pages)} page(s) had no matching template: "
            f"{result.unmatched_pages}. Run `learn` with a correctly edited sample "
            "of this layout so future runs handle it automatically.",
            file=sys.stderr,
        )
        return 1
    print(f"\nWrote {args.output}")
    return 0


def cmd_learn(args: argparse.Namespace) -> int:
    template, clusters = learn_template(
        original_path=args.original,
        edited_path=args.edited,
        template_id=args.id,
        display_name=args.name,
        detect_all_of=args.detect,
        page_index=args.page,
    )
    print(f"Found {len(clusters)} region(s) that were removed in the edited copy:\n")
    for c in clusters:
        preview = c["text"][:90] + ("..." if len(c["text"]) > 90 else "")
        print(f"  rect={tuple(round(v, 1) for v in c['rect'])}  text={preview!r}")

    if not clusters:
        print("\nNothing detected as removed -- is `--edited` really different from `--original`?")
        return 1

    print(
        "\nReview the list above: every rect should be something you actually want "
        "redacted (customer/order/shipping info), not material/test data.\n"
        "If it looks right, re-run with --save to write the template."
    )
    if args.save:
        path = save_template(template)
        print(f"\nSaved template to {path}")
    return 0


def cmd_build(args: argparse.Namespace) -> int:
    from . import drive as drive_mod  # deferred: only `build` needs the Google API stack

    creds = drive_mod.get_credentials()
    client = drive_mod.DriveClient(creds)
    folder_id = drive_mod.extract_folder_id(args.drive_folder)

    print(f"Listing PDFs under Drive folder {folder_id} ...")
    all_pdfs = client.list_pdfs_under_folder(folder_id)
    print(f"Found {len(all_pdfs)} PDF(s) total under that folder.")

    with tempfile.TemporaryDirectory(prefix="mtr_merger_") as tmp:
        tmp_path = Path(tmp)
        redacted_paths: list[Path] = []
        missing_heats: list[str] = []
        unmatched_template_files: list[str] = []

        for heat in args.heats:
            matches = client.find_files_for_heat(folder_id, heat, all_pdfs=all_pdfs)
            if not matches:
                print(f"  [{heat}] no matching PDF found in Drive")
                missing_heats.append(heat)
                continue

            for f in matches:
                print(f"  [{heat}] downloading {f['name']} ...")
                downloaded = client.download_file(f["id"], tmp_path / "downloaded" / f["name"])
                redacted_path = tmp_path / "redacted" / f["name"]
                result = redact_pdf(downloaded, redacted_path)
                if result.unmatched_pages:
                    print(
                        f"    WARNING: {f['name']} has page(s) "
                        f"{result.unmatched_pages} with no matching redaction "
                        "template -- included un-redacted, please review before sending."
                    )
                    unmatched_template_files.append(f["name"])
                redacted_paths.append(redacted_path)

        if not redacted_paths:
            print("\nNo files found for any of the given heat numbers -- nothing to merge.")
            return 1

        out_dir = Path(args.out) if args.out else Path.cwd()
        out_path = out_dir / f"{args.invoice} MTRs.pdf"
        merge_pdfs(redacted_paths, out_path)

    print(f"\nWrote {out_path} ({len(redacted_paths)} document(s) merged)")
    if missing_heats:
        print(f"Heat numbers with no file found: {missing_heats}", file=sys.stderr)
    if unmatched_template_files:
        print(
            f"Files with un-redacted pages (unknown layout): {unmatched_template_files}",
            file=sys.stderr,
        )
    if missing_heats or unmatched_template_files:
        return 1
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mtr-merger")
    sub = parser.add_subparsers(dest="command", required=True)

    p_list = sub.add_parser("list-templates", help="show known redaction templates")
    p_list.set_defaults(func=cmd_list_templates)

    p_redact = sub.add_parser("redact", help="redact a single PDF using known templates")
    p_redact.add_argument("input")
    p_redact.add_argument("output")
    p_redact.set_defaults(func=cmd_redact)

    p_learn = sub.add_parser("learn", help="learn a new template from an original/edited sample pair")
    p_learn.add_argument("--original", required=True)
    p_learn.add_argument("--edited", required=True)
    p_learn.add_argument("--id", required=True, help="short unique id, e.g. acme_steel_mtr")
    p_learn.add_argument("--name", required=True, help="human-readable display name")
    p_learn.add_argument("--detect", nargs="+", required=True,
                          help="one or more phrases that must all appear on the page "
                               "to identify this layout, e.g. --detect \"ACME STEEL\" \"Mill Test Report\"")
    p_learn.add_argument("--page", type=int, default=0, help="page index to diff (default 0)")
    p_learn.add_argument("--save", action="store_true", help="write the template after review")
    p_learn.set_defaults(func=cmd_learn)

    p_build = sub.add_parser("build", help="find MTRs by heat number in Drive, redact, and merge")
    p_build.add_argument("--invoice", required=True, help="invoice number; output is '<invoice> MTRs.pdf'")
    p_build.add_argument("--heats", nargs="+", required=True, help="one or more heat numbers")
    p_build.add_argument("--drive-folder", required=True, help="shared Drive folder URL or ID")
    p_build.add_argument("--out", help="output directory (default: current directory)")
    p_build.set_defaults(func=cmd_build)

    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
