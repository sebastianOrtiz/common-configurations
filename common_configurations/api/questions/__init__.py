"""
Questions API Domain

Shared "Portal Question Set" model + helpers (resolve/compose/parse) that
any Service Portal tool (logbook/procedures, PQR, lex/my_cases, ...) reuses
to replace a single free-text context field with a configurable list of
questions. Pure helpers, stateless — no HTTP endpoints of its own; each
consuming app calls these directly from its own endpoints/service layer.
"""

from .service import (
    resolve_questions,
    compose_context,
    parse_answers,
    QUESTION_SET_DOCTYPE,
    QUESTION_DOCTYPE,
)

__all__ = [
    "resolve_questions",
    "compose_context",
    "parse_answers",
    "QUESTION_SET_DOCTYPE",
    "QUESTION_DOCTYPE",
]
