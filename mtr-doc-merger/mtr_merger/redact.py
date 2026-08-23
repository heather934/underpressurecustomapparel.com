"""Applies template redaction rules to a PDF and merges redacted PDFs."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import fitz  # PyMuPDF

from .templates import Template, load_templates, match_template


@dataclass
class PageResult:
    page_index: int
    template_id: str | None
    template_name: str | None


@dataclass
class RedactResult:
    pages: list[PageResult]

    @property
    def unmatched_pages(self) -> list[int]:
        return [p.page_index for p in self.pages if p.template_id is None]


def redact_pdf(input_path: str | Path, output_path: str | Path,
                templates: list[Template] | None = None) -> RedactResult:
    """Redact every page of input_path using whichever known template matches
    it, and write the result to output_path. Pages whose layout doesn't match
    any known template are left untouched and reported in the result so the
    caller can flag them (see cli.py's --strict / learn workflow).
    """
    templates = templates if templates is not None else load_templates()
    doc = fitz.open(str(input_path))
    results: list[PageResult] = []

    for page_index, page in enumerate(doc):
        text = page.get_text()
        template = match_template(text, templates)
        if template is None:
            results.append(PageResult(page_index, None, None))
            continue

        for rect in template.redact_rects:
            page.add_redact_annot(fitz.Rect(*rect), fill=(1, 1, 1))
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_PIXELS)
        results.append(PageResult(page_index, template.id, template.display_name))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(output_path), garbage=4, deflate=True)
    doc.close()
    return RedactResult(results)


def merge_pdfs(input_paths: list[str | Path], output_path: str | Path) -> None:
    merged = fitz.open()
    for path in input_paths:
        with fitz.open(str(path)) as src:
            merged.insert_pdf(src)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    merged.save(str(output_path), garbage=4, deflate=True)
    merged.close()
