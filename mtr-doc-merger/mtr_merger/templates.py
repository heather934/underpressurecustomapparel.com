"""Loading, matching, and saving redaction templates.

A template describes, for one mill/broker PDF layout, which rectangular
regions of the page should be blanked out (customer/order/shipping info)
so that only the material certification data is left. Templates are learned
from a real (original, edited-by-hand) sample pair -- see learn.py -- and
stored as JSON so new layouts can be added without touching code.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


@dataclass
class Template:
    id: str
    display_name: str
    detect_all_of: list[str]
    redact_rects: list[tuple[float, float, float, float]]
    notes: str = ""

    @classmethod
    def from_json(cls, data: dict) -> "Template":
        return cls(
            id=data["id"],
            display_name=data["display_name"],
            detect_all_of=list(data["detect_all_of"]),
            redact_rects=[tuple(r) for r in data["redact_rects"]],
            notes=data.get("notes", ""),
        )

    def to_json(self) -> dict:
        return {
            "id": self.id,
            "display_name": self.display_name,
            "detect_all_of": self.detect_all_of,
            "redact_rects": [list(r) for r in self.redact_rects],
            "notes": self.notes,
        }

    def matches(self, page_text: str) -> bool:
        haystack = page_text.upper()
        return all(needle.upper() in haystack for needle in self.detect_all_of)


def load_templates(templates_dir: Path = TEMPLATES_DIR) -> list[Template]:
    templates = []
    if not templates_dir.exists():
        return templates
    for path in sorted(templates_dir.glob("*.json")):
        with open(path) as f:
            templates.append(Template.from_json(json.load(f)))
    return templates


def save_template(template: Template, templates_dir: Path = TEMPLATES_DIR) -> Path:
    templates_dir.mkdir(parents=True, exist_ok=True)
    path = templates_dir / f"{template.id}.json"
    with open(path, "w") as f:
        json.dump(template.to_json(), f, indent=2)
    return path


def match_template(page_text: str, templates: list[Template] | None = None) -> Template | None:
    templates = templates if templates is not None else load_templates()
    for template in templates:
        if template.matches(page_text):
            return template
    return None
