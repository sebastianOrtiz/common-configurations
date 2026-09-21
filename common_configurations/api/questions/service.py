"""
Portal Question Set — shared helpers.

Reusable domain that lets any Service Portal tool (logbook/procedures, PQR,
lex/my_cases, ...) replace a single free-text "context" field with a
configurable list of questions, without each app reimplementing its own
question model. This module owns the resolve/compose/parse contract other
apps build their tool-specific logic on top of:

- `resolve_questions`: Portal Question Set docname -> ordered list of
  question dicts, ready to render a dynamic form.
- `compose_context`: answers collected from that form -> a single legible
  text block (for anything that still stores "context" as plain text).
- `parse_answers`: raw (str | list) request payload -> sanitized list of
  answer dicts.

Fase 1 (this module) only builds the shared model + helpers. Wiring a
`question_set` Link onto a specific tool's own doctype/flow (e.g. Logbook
Procedure) is Fase 2, done by each consuming app.
"""

from __future__ import annotations

import json
from typing import Any, Optional

import frappe
from frappe import _

from ..shared.validators import sanitize_string

QUESTION_SET_DOCTYPE = "Portal Question Set"
QUESTION_DOCTYPE = "Portal Question"

_ANSWER_KEY_MAX_LENGTH = 140
_QUESTION_MAX_LENGTH = 500
_ANSWER_MAX_LENGTH = 5000


def resolve_questions(question_set: Optional[str]) -> list[dict[str, Any]]:
    """Resolve a Portal Question Set into its ordered list of questions.

    Args:
        question_set: docname (== `set_name`) of a Portal Question Set, or
            None/empty when the tool has no question set configured.

    Returns:
        list[dict]: one entry per question, ordered by `sort_order`, shaped
        exactly as:

            {
                "answer_key": str,        # from the row, or frappe.scrub(question)
                "question": str,
                "fieldtype": str,         # Data | Small Text | Select | Int | Email
                "options": list[str],     # only meaningful when fieldtype == "Select"
                "reqd": 0 | 1,
                "sort_order": int,
            }

        Returns [] when `question_set` is falsy, doesn't exist, or is
        inactive (`is_active=0`) — never raises for a missing/inactive set,
        so callers can pass tool config straight through without guarding.
    """
    if not question_set:
        return []

    is_active = frappe.db.exists(QUESTION_SET_DOCTYPE, {"name": question_set, "is_active": 1})
    if not is_active:
        return []

    rows = frappe.get_all(
        QUESTION_DOCTYPE,
        filters={"parenttype": QUESTION_SET_DOCTYPE, "parent": question_set},
        fields=["question", "answer_key", "fieldtype", "options", "reqd", "sort_order", "idx"],
        order_by="sort_order asc, idx asc",
    )

    questions = []
    for row in rows:
        question_text = row.question or ""
        answer_key = row.answer_key or frappe.scrub(question_text)
        options = [opt.strip() for opt in (row.options or "").split("\n") if opt.strip()]

        questions.append(
            {
                "answer_key": answer_key,
                "question": question_text,
                "fieldtype": row.fieldtype or "Small Text",
                "options": options,
                "reqd": 1 if row.reqd else 0,
                "sort_order": row.sort_order or 0,
            }
        )

    return questions


def compose_context(answers: list[dict[str, Any]]) -> str:
    """Compose a legible "Question: answer" text block from answers.

    Args:
        answers: list of `{answer_key?, question?, answer}` dicts — the
            shape produced by `parse_answers` (or any equivalent payload).
            Uses `question` as the label when present, falling back to
            `answer_key`. Items without a non-empty `answer` are ignored.

    Returns:
        str: one "Label: answer" line per answered item, joined with "\\n".
        Empty string if there is nothing to compose.
    """
    if not answers:
        return ""

    lines = []
    for item in answers:
        if not isinstance(item, dict):
            continue

        answer = item.get("answer")
        if answer in (None, ""):
            continue

        label = item.get("question") or item.get("answer_key")
        if not label:
            continue

        lines.append(f"{label}: {answer}")

    return "\n".join(lines)


def parse_answers(raw: Any) -> list[dict[str, Any]]:
    """Parse/sanitize the `answers` payload sent back by a dynamic form.

    Tolerates both a JSON string and an already-deserialized list (same
    pattern as `contacts.validators.parse_contact_data`).

    Args:
        raw: JSON string or list of `{answer_key?, question?, answer}` dicts.

    Returns:
        list[dict]: sanitized entries, each with whichever of `answer_key`
        (str, <=140 chars), `question` (str, <=500 chars) and `answer`
        (str, <=5000 chars) were present and non-empty. Entries that are not
        dicts, or that carry no usable `answer_key`/`question`, are dropped.

    Raises:
        frappe.ValidationError: if `raw` is a string that isn't valid JSON,
            or if the parsed payload is not a list.
    """
    if raw is None:
        return []

    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except json.JSONDecodeError:
            frappe.throw(_("Invalid answers format"), frappe.ValidationError)

    if not isinstance(raw, list):
        frappe.throw(_("Answers must be a list"), frappe.ValidationError)

    sanitized = []
    for item in raw:
        if not isinstance(item, dict):
            continue

        answer_key = sanitize_string(item.get("answer_key"), _ANSWER_KEY_MAX_LENGTH)
        question = sanitize_string(item.get("question"), _QUESTION_MAX_LENGTH)
        if not answer_key and not question:
            continue

        entry: dict[str, Any] = {}
        if answer_key:
            entry["answer_key"] = answer_key
        if question:
            entry["question"] = question

        answer = item.get("answer")
        if answer not in (None, ""):
            entry["answer"] = sanitize_string(str(answer), _ANSWER_MAX_LENGTH)

        sanitized.append(entry)

    return sanitized
