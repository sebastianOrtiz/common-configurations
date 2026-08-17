"""
Navigation Service

Business logic for voice/intent-based navigation of the Service Portal:
"I don't know which secretaría has what I need, I just know what I want
to do" — the citizen speaks (or types) a phrase and this service resolves
it to one or more navigable Logbook Procedures, without requiring the
citizen to know the portal's tool/secretaría structure up front.

Two-stage resolution, entirely stateless:

1. Catalog build — flattens every `procedures` tool of a Service Portal
   into a flat list of navigable destinations (one per active Logbook
   Procedure inside each tool's active Logbook Procedures Config).

2. Resolve — scores the catalog against the spoken query using a
   dependency-free fuzzy match (always runs, works offline, no AI
   required). Only when the fuzzy match is NOT confident does it
   optionally consult a configured AI model to re-rank/clarify; any AI
   failure silently falls back to the fuzzy result.
"""

from __future__ import annotations

import json
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

import frappe

# ---------------------------------------------------------------------
# Fuzzy matching configuration
# ---------------------------------------------------------------------

# Field weights: how much each field contributes to a token match.
WEIGHT_TITLE = 3.0
WEIGHT_KEYWORDS = 3.0
WEIGHT_SECRETARIA = 1.5
WEIGHT_DESCRIPTION = 0.75

# Token match credit tiers (how "close" two normalized tokens are).
CREDIT_EXACT = 1.0
CREDIT_CONTAINMENT = 0.9  # one token contains the other (handles plurals: querella/querellas)
CREDIT_STEM = 0.6  # long common prefix (handles conjugations: consultar/consulte)
MIN_FUZZY_TOKEN_LEN = 4  # below this, only exact matches count (avoids noisy short-token matches)

# Confidence thresholds for the fuzzy path (tuned against the score
# formula above: score = raw_weighted_credit / len(query_tokens)).
CONFIDENCE_SCORE_THRESHOLD = 1.2  # UMBRAL
CONFIDENCE_MARGIN_THRESHOLD = 0.5  # MARGEN (gap between top1 and top2)

MAX_CHOOSE_RESULTS = 5
MIN_CHOOSE_RESULTS = 2

# Basic Spanish stopwords/filler words typical of spoken navigation
# queries ("quiero saber sobre mi eps" -> "saber", "eps").
STOPWORDS = {
    "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos",
    "ante", "ayuda", "buscar", "busco", "como", "con", "cual", "cuales",
    "de", "del", "donde", "dónde", "e", "el", "ella", "ellas", "ello",
    "ellos", "en", "es", "esa", "esas", "ese", "eso", "esos", "esta",
    "estan", "estas", "este", "esto", "estos", "favor", "hacer", "hay",
    "la", "las", "le", "les", "lo", "los", "mas", "me", "mi", "mis",
    "necesito", "nos", "nuestra", "nuestro", "o", "para", "pero", "poder",
    "por", "porfa", "porfavor", "puedo", "que", "quien", "quienes",
    "quiero", "sabre", "saber", "se", "si", "sin", "sobre", "su", "sus",
    "tambien", "tengo", "tu", "tus", "un", "una", "unas", "uno", "unos",
    "y", "ya", "yo",
}

_TOKEN_RE = re.compile(r"[a-z0-9]+")

# Batch size for the AI enrichment pass (keeps prompts small/cheap).
AI_ENRICH_BATCH_SIZE = 15


# ---------------------------------------------------------------------
# Text normalization
# ---------------------------------------------------------------------


def _strip_accents(text: str) -> str:
    """ASCII-fold accented characters (á -> a, ñ -> n, etc.)."""
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(c for c in normalized if not unicodedata.combining(c))


def _tokenize(text: Optional[str]) -> List[str]:
    """lowercase -> strip accents -> extract word tokens -> drop stopwords."""
    if not text:
        return []
    folded = _strip_accents(str(text).lower())
    tokens = _TOKEN_RE.findall(folded)
    return [t for t in tokens if t not in STOPWORDS]


def _token_credit(a: str, b: str) -> float:
    """How well two normalized tokens match, from 0.0 (no match) to 1.0 (exact)."""
    if a == b:
        return CREDIT_EXACT
    if len(a) < MIN_FUZZY_TOKEN_LEN or len(b) < MIN_FUZZY_TOKEN_LEN:
        return 0.0
    if a in b or b in a:
        return CREDIT_CONTAINMENT
    shorter, longer = (a, b) if len(a) <= len(b) else (b, a)
    common_prefix = 0
    for ca, cb in zip(shorter, longer):
        if ca != cb:
            break
        common_prefix += 1
    if common_prefix >= MIN_FUZZY_TOKEN_LEN and common_prefix >= 0.6 * len(shorter):
        return CREDIT_STEM
    return 0.0


def _best_credit_against_field(query_token: str, field_tokens: List[str]) -> float:
    """Best match credit of `query_token` against any token in `field_tokens`."""
    best = 0.0
    for ft in field_tokens:
        credit = _token_credit(query_token, ft)
        if credit > best:
            best = credit
        if best == CREDIT_EXACT:
            break
    return best


def default_procedures_provider(portal_doc: Any, tool_row: Any) -> List[Dict[str, Any]]:
    """
    Default `portal_navigation_providers` provider: expands a `procedures`
    tool into one navigable sub-item per active Logbook Procedure inside its
    active Logbook Procedures Config.

    This is the reference implementation of the provider contract — see
    `NavigationService.build_catalog` docstring for the full contract that
    other apps must follow to contribute their own sub-items for other tool
    types. It is registered as a normal provider (not special-cased) via
    `portal_navigation_providers` in this app's `hooks.py`.

    Args:
        portal_doc: The loaded Service Portal document (unused here, but
            part of the contract — other providers may need portal-level
            context, e.g. branding or locale).
        tool_row: A single row of `portal_doc.tools` (Service Portal Tool).

    Returns:
        list[dict]: `[]` if `tool_row.tool_type != "procedures"` (or it has
        no usable config) — i.e. "not my tool type, nothing to add" — else
        one dict per active procedure, shaped like every other catalog item
        (see `build_catalog`).
    """
    if tool_row.tool_type != "procedures" or not tool_row.is_enabled:
        return []

    config_name = getattr(tool_row, "logbook_procedures_config", None)
    if not config_name:
        return []

    config = frappe.db.get_value(
        "Logbook Procedures Config",
        {"name": config_name, "is_active": 1},
        "name",
    )
    if not config:
        return []

    config_doc = frappe.get_doc("Logbook Procedures Config", config)

    sub_items: List[Dict[str, Any]] = []
    for row in sorted(config_doc.procedures or [], key=lambda x: x.sort_order or 0):
        if not row.procedure:
            continue

        proc = frappe.db.get_value(
            "Logbook Procedure",
            row.procedure,
            [
                "name",
                "title",
                "description",
                "keywords",
                "procedure_type",
                "external_url",
                "is_active",
            ],
            as_dict=True,
        )
        if not proc or not proc.is_active:
            continue

        sub_items.append(
            {
                "kind": "procedure",
                "id": proc.name,
                "title": proc.title,
                "description": proc.description or "",
                "keywords": proc.keywords or "",
                "secretaria": tool_row.label,
                "tool_name": tool_row.name,
                "tool_type": tool_row.tool_type,
                "procedure_name": proc.name,
                "type": proc.procedure_type,
                "external_url": (proc.external_url or "") if proc.procedure_type == "external" else None,
            }
        )

    return sub_items


class NavigationService:
    """Stateless service for the Service Portal voice navigation resolver."""

    # ------------------------------------------------------------------
    # Catalog (legacy: procedures-only — kept for `get_navigation_catalog`
    # and as the fallback path of `resolve()` when no Portal Navigation
    # Catalog cache exists yet for a portal).
    # ------------------------------------------------------------------

    @classmethod
    def get_catalog(cls, portal_name: str) -> List[Dict[str, Any]]:
        """
        Flatten every active `procedures` tool of an active Service Portal
        into a flat list of navigable destinations.

        Args:
            portal_name: The portal_name identifier of a Service Portal.

        Returns:
            list[dict]: one entry per active Logbook Procedure inside each
            active Logbook Procedures Config referenced by a `procedures`
            tool of the portal.

        Raises:
            frappe.DoesNotExistError: If the portal doesn't exist or is inactive.
        """
        portal_doc = cls._get_active_portal_doc(portal_name)

        catalog: List[Dict[str, Any]] = []
        for tool in portal_doc.tools:
            if tool.tool_type != "procedures" or not tool.is_enabled:
                continue
            catalog.extend(default_procedures_provider(portal_doc, tool))

        return catalog

    # ------------------------------------------------------------------
    # Full catalog builder (extensible — covers every enabled tool)
    # ------------------------------------------------------------------

    @classmethod
    def build_catalog(cls, portal_name: str) -> Dict[str, Any]:
        """
        Build the FULL navigation catalog of a Service Portal: one
        tool-level entry per enabled tool (guaranteeing every tool is
        reachable, even ones no provider knows how to expand), plus
        whatever sub-items the registered `portal_navigation_providers`
        contribute for each tool.

        Hook contract — `portal_navigation_providers` (declared in a
        consuming app's `hooks.py` as a list of dotted paths, e.g.::

            portal_navigation_providers = [
                "common_configurations.api.navigation.service.default_procedures_provider",
                "my_app.navigation.my_tool_provider",
            ]

        Each dotted path must resolve (via `frappe.get_attr`) to a
        callable with signature::

            provider(portal_doc: "Service Portal", tool_row: "Service Portal Tool") -> list[dict]

        - Called once per ENABLED tool row of the portal (every provider
          sees every tool row — it's up to the provider to check
          `tool_row.tool_type` and return `[]` for tool types it doesn't
          know how to expand).
        - Must return a list of item dicts (possibly empty), each shaped
          like::

              {
                  "kind": str,            # e.g. "procedure", or a custom kind
                  "id": str,              # globally unique across the catalog
                  "title": str,
                  "description": str,
                  "keywords": str,        # free text, used for fuzzy matching
                  "secretaria": str,      # human label shown to the citizen
                  "tool_name": str,       # tool_row.name (Service Portal Tool docname)
                  "tool_type": str,       # tool_row.tool_type
                  "procedure_name": str | None,
                  "type": str | None,
                  "external_url": str | None,
              }

        - Must NEVER raise: any exception from a provider is caught and
          logged per-provider-per-tool, and simply yields no sub-items for
          that combination — it never aborts the whole build (the
          tool-level fallback entry already guarantees that tool stays
          navigable).
        - Not required: an app is free to not implement a provider at all;
          its tools remain reachable through their tool-level entry.

        Returns:
            dict: {"items": list[dict], "tool_count": int, "item_count": int}

        Raises:
            frappe.DoesNotExistError: If the portal doesn't exist or is inactive.
        """
        portal_doc = cls._get_active_portal_doc(portal_name)
        providers = cls._get_navigation_providers()

        items: List[Dict[str, Any]] = []
        tool_count = 0

        for tool in portal_doc.tools:
            if not tool.is_enabled:
                continue
            tool_count += 1

            # Tool-level entry — ALWAYS added, guaranteeing every enabled
            # tool is reachable even if no provider covers its tool_type.
            items.append(
                {
                    "kind": "tool",
                    "id": f"tool:{tool.name}",
                    "title": tool.label,
                    "secretaria": tool.label,
                    "description": tool.tool_description or "",
                    "keywords": "",
                    "tool_name": tool.name,
                    "tool_type": tool.tool_type,
                    "procedure_name": None,
                    "type": None,
                    "external_url": None,
                }
            )

            for provider in providers:
                try:
                    sub_items = provider(portal_doc, tool) or []
                except Exception:
                    frappe.log_error(
                        title="Navigation provider failed",
                        message=(
                            f"provider={getattr(provider, '__module__', '?')}."
                            f"{getattr(provider, '__name__', provider)} "
                            f"tool={tool.name} ({tool.tool_type})\n\n"
                            f"{frappe.get_traceback()}"
                        ),
                    )
                    sub_items = []
                items.extend(sub_items)

        return {"items": items, "tool_count": tool_count, "item_count": len(items)}

    @staticmethod
    def _get_active_portal_doc(portal_name: str):
        """Load an active Service Portal by its `portal_name`, or throw."""
        portal = frappe.db.get_value(
            "Service Portal", {"portal_name": portal_name, "is_active": 1}, "name"
        )
        if not portal:
            frappe.throw(frappe._("Portal not found"), frappe.DoesNotExistError)
        return frappe.get_doc("Service Portal", portal)

    @staticmethod
    def _get_navigation_providers() -> List[Any]:
        """Resolve every dotted path in the `portal_navigation_providers`
        hook into a callable. Invalid paths are logged and skipped."""
        resolved: List[Any] = []
        for dotted_path in frappe.get_hooks("portal_navigation_providers") or []:
            try:
                resolved.append(frappe.get_attr(dotted_path))
            except Exception:
                frappe.log_error(
                    title="Invalid portal_navigation_providers entry",
                    message=f"{dotted_path}\n\n{frappe.get_traceback()}",
                )
        return resolved

    # ------------------------------------------------------------------
    # AI enrichment (best-effort, never required)
    # ------------------------------------------------------------------

    @classmethod
    def enrich_catalog_with_ai(cls, items: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], bool]:
        """
        Enrich every catalog item with citizen-facing keywords/synonyms
        generated by the configured AI model — how a Colombian citizen
        would colloquially ask for it, in batches to control cost/latency.

        Fuses the AI-generated keywords into each item's existing
        `keywords` field (never replaces what's already there). Any
        failure (AI disabled/not configured, network error, bad JSON, a
        single batch failing, ...) leaves the affected items unenriched —
        this method NEVER raises.

        Args:
            items: Catalog items as built by `build_catalog` (mutated in
                place and also returned for convenience).

        Returns:
            tuple[list[dict], bool]: (items, used_ai) — `used_ai` is True
            only if at least one batch was successfully enriched.
        """
        used_ai = False
        try:
            if not frappe.db.get_single_value(
                "Common Configurations Settings", "enable_voice_assistant_ai"
            ):
                return items, False

            ai_config = frappe.db.get_single_value(
                "Common Configurations Settings", "voice_assistant_ai_configuration"
            )
            if not ai_config:
                return items, False

            from common_configurations.api.ai.client_factory import get_ai_client

            client = get_ai_client(ai_config)

            system_prompt = (
                "Eres un experto en cómo los ciudadanos colombianos hablan "
                "coloquialmente al buscar trámites y servicios en un portal "
                "municipal. Para cada ítem del catálogo que te doy (con su "
                "título, descripción, secretaría y tipo), genera una lista "
                "de palabras clave y sinónimos de cómo un ciudadano diría "
                "eso mismo, incluyendo formas coloquiales, informales y "
                "abreviadas (ej: 'eps' para 'entidad promotora de salud'). "
                "Responde SIEMPRE y ÚNICAMENTE con un objeto JSON plano, "
                "sin texto adicional antes ni después, ni bloques de "
                "código, con esta forma exacta: "
                '{"<id>": ["palabra1", "palabra2", ...], ...} '
                "usando ÚNICAMENTE los ids que te doy, una entrada por "
                "cada ítem recibido."
            )

            for start in range(0, len(items), AI_ENRICH_BATCH_SIZE):
                batch = items[start : start + AI_ENRICH_BATCH_SIZE]
                try:
                    compact_batch = [
                        {
                            "id": item["id"],
                            "title": item.get("title") or "",
                            "description": item.get("description") or "",
                            "secretaria": item.get("secretaria") or "",
                            "type": item.get("kind") or "",
                        }
                        for item in batch
                    ]
                    prompt = json.dumps({"items": compact_batch}, ensure_ascii=False)

                    raw_response = client.chat(prompt, system_prompt)
                    parsed = cls._parse_ai_json(raw_response)
                    if not isinstance(parsed, dict):
                        continue

                    by_id = {item["id"]: item for item in batch}
                    for item_id, keywords in parsed.items():
                        item = by_id.get(item_id)
                        if not item or not isinstance(keywords, list):
                            continue

                        existing = [
                            k.strip() for k in (item.get("keywords") or "").split(",") if k.strip()
                        ]
                        new_keywords = [str(k).strip() for k in keywords if str(k).strip()]
                        merged = existing + [k for k in new_keywords if k not in existing]
                        if merged:
                            item["keywords"] = ", ".join(merged)
                            used_ai = True

                except Exception:
                    frappe.log_error(
                        title="Navigation AI enrich batch failed",
                        message=frappe.get_traceback(),
                    )
                    continue

            return items, used_ai

        except Exception:
            frappe.log_error(
                title="Navigation AI enrich failed",
                message=frappe.get_traceback(),
            )
            return items, used_ai

    # ------------------------------------------------------------------
    # Resolve (fuzzy always, AI only as a fallback for low-confidence)
    # ------------------------------------------------------------------

    @classmethod
    def resolve(cls, query: str, portal_name: str) -> Dict[str, Any]:
        """
        Resolve a spoken/typed query to navigable destination(s).

        Reads the cached `Portal Navigation Catalog` (built by
        `build_catalog` + optionally `enrich_catalog_with_ai`, covering
        every tool of the portal) when one exists for this portal; falls
        back to the legacy on-the-fly procedures-only catalog otherwise —
        so a portal that has never been "built" keeps working exactly as
        before.

        Returns a dict shaped as:
            {
                "mode": "navigate" | "choose" | "none",
                "results": [ {id, title, secretaria, tool_name,
                              procedure_name, type, external_url, score}, ... ],
                "clarifying_question": str | None,
                "transcript": <query>,
                "used_ai": bool,
            }
        """
        catalog = cls._get_catalog_for_resolve(portal_name)
        scored = cls._fuzzy_rank(query, catalog)

        fuzzy_mode, fuzzy_results, fuzzy_question = cls._decide(scored)

        if fuzzy_mode == "navigate":
            return cls._response(fuzzy_mode, fuzzy_results, fuzzy_question, query, used_ai=False)

        # Fuzzy wasn't confident enough — try AI as a supplement, never as
        # a hard dependency. Any failure (not configured, network error,
        # bad JSON, ...) silently keeps the fuzzy result.
        ai_outcome = cls._try_ai_resolve(query, catalog, scored)
        if ai_outcome is not None:
            ai_mode, ai_results, ai_question = ai_outcome
            return cls._response(ai_mode, ai_results, ai_question, query, used_ai=True)

        return cls._response(fuzzy_mode, fuzzy_results, fuzzy_question, query, used_ai=False)

    @classmethod
    def _get_catalog_for_resolve(cls, portal_name: str) -> List[Dict[str, Any]]:
        """Prefer the cached `Portal Navigation Catalog` (fast, covers the
        whole portal, possibly AI-enriched); fall back to the legacy
        on-the-fly procedures-only catalog when no cache exists yet."""
        cached_json = frappe.db.get_value(
            "Portal Navigation Catalog", {"portal": portal_name}, "catalog_json"
        )
        if cached_json:
            try:
                items = json.loads(cached_json)
                if isinstance(items, list):
                    return items
            except (ValueError, TypeError):
                frappe.log_error(
                    title="Corrupt Portal Navigation Catalog cache",
                    message=f"portal={portal_name}",
                )

        return cls.get_catalog(portal_name)

    # ------------------------------------------------------------------
    # Fuzzy scoring
    # ------------------------------------------------------------------

    @classmethod
    def _fuzzy_rank(
        cls, query: str, catalog: List[Dict[str, Any]]
    ) -> List[Tuple[Dict[str, Any], float]]:
        """Score every catalog item against `query`, sorted best-first."""
        query_tokens = _tokenize(query)
        if not query_tokens or not catalog:
            return [(item, 0.0) for item in catalog]

        field_tokens_cache = [
            {
                "title": _tokenize(item.get("title")),
                "keywords": _tokenize(item.get("keywords")),
                "secretaria": _tokenize(item.get("secretaria")),
                "description": _tokenize(item.get("description")),
            }
            for item in catalog
        ]

        scored: List[Tuple[Dict[str, Any], float]] = []
        for item, field_tokens in zip(catalog, field_tokens_cache):
            raw = 0.0
            for qt in query_tokens:
                raw += WEIGHT_TITLE * _best_credit_against_field(qt, field_tokens["title"])
                raw += WEIGHT_KEYWORDS * _best_credit_against_field(qt, field_tokens["keywords"])
                raw += WEIGHT_SECRETARIA * _best_credit_against_field(qt, field_tokens["secretaria"])
                raw += WEIGHT_DESCRIPTION * _best_credit_against_field(qt, field_tokens["description"])
            score = raw / len(query_tokens)
            scored.append((item, score))

        scored.sort(key=lambda pair: pair[1], reverse=True)
        return scored

    @classmethod
    def _decide(
        cls, scored: List[Tuple[Dict[str, Any], float]]
    ) -> Tuple[str, List[Dict[str, Any]], Optional[str]]:
        """Turn a sorted (item, score) list into (mode, results, clarifying_question)."""
        nonzero = [(item, score) for item, score in scored if score > 0]
        if not nonzero:
            return "none", [], None

        top1_score = nonzero[0][1]
        top2_score = nonzero[1][1] if len(nonzero) > 1 else 0.0

        if top1_score >= CONFIDENCE_SCORE_THRESHOLD and (top1_score - top2_score) >= CONFIDENCE_MARGIN_THRESHOLD:
            return "navigate", [cls._to_result(nonzero[0][0], nonzero[0][1])], None

        choices = nonzero[: max(MIN_CHOOSE_RESULTS, MAX_CHOOSE_RESULTS)][:MAX_CHOOSE_RESULTS]
        results = [cls._to_result(item, score) for item, score in choices]
        return "choose", results, None

    @staticmethod
    def _to_result(item: Dict[str, Any], score: float) -> Dict[str, Any]:
        return {
            "id": item["id"],
            "kind": item.get("kind", "procedure"),
            "title": item["title"],
            "secretaria": item["secretaria"],
            "tool_name": item["tool_name"],
            "procedure_name": item.get("procedure_name"),
            "type": item.get("type"),
            "external_url": item.get("external_url"),
            "score": round(score, 4),
        }

    @staticmethod
    def _response(
        mode: str,
        results: List[Dict[str, Any]],
        clarifying_question: Optional[str],
        query: str,
        used_ai: bool,
    ) -> Dict[str, Any]:
        return {
            "mode": mode,
            "results": results,
            "clarifying_question": clarifying_question,
            "transcript": query,
            "used_ai": used_ai,
        }

    # ------------------------------------------------------------------
    # AI supplement (best-effort, never required)
    # ------------------------------------------------------------------

    @classmethod
    def _try_ai_resolve(
        cls,
        query: str,
        catalog: List[Dict[str, Any]],
        scored: List[Tuple[Dict[str, Any], float]],
    ) -> Optional[Tuple[str, List[Dict[str, Any]], Optional[str]]]:
        """
        Ask the configured AI model to rank the catalog for `query`.

        Returns None (meaning: "keep the fuzzy result") whenever AI is not
        enabled/configured, or anything about the call/parse fails.
        """
        try:
            if not frappe.db.get_single_value(
                "Common Configurations Settings", "enable_voice_assistant_ai"
            ):
                return None

            ai_config = frappe.db.get_single_value(
                "Common Configurations Settings", "voice_assistant_ai_configuration"
            )
            if not ai_config:
                return None

            from common_configurations.api.ai.client_factory import get_ai_client

            client = get_ai_client(ai_config)

            compact_catalog = [
                {
                    "id": item["id"],
                    "title": item["title"],
                    "secretaria": item["secretaria"],
                    "keywords": item.get("keywords") or "",
                }
                for item in catalog
            ]

            system_prompt = (
                "Eres el motor de navegación por voz de un portal de trámites "
                "municipales. Un ciudadano dice una frase describiendo lo que "
                "necesita, y tú debes identificar a cuál trámite del catálogo "
                "se refiere, sin importar en qué secretaría esté. "
                "Responde SIEMPRE y ÚNICAMENTE con un objeto JSON, sin texto "
                "adicional antes ni después, con esta forma exacta: "
                '{"ranked_ids": ["<id>", ...], "confidence": "high"|"medium"|"low", '
                '"clarifying_question": "<pregunta breve en español>" o null}. '
                "'ranked_ids' debe listar como máximo 5 ids del catálogo, del "
                "más al menos probable, usando ÚNICAMENTE ids que existan en el "
                "catálogo. Usa confidence='high' solo si estás razonablemente "
                "seguro de un único trámite. Usa confidence='low' o "
                "'medium' si hay ambigüedad real entre varias opciones, y en "
                "ese caso 'clarifying_question' debe ser una pregunta corta "
                "para ayudar al ciudadano a elegir. Si nada del catálogo "
                "corresponde a lo que pide, responde ranked_ids: [] y "
                "confidence: 'low'."
            )
            prompt = json.dumps(
                {"query": query, "catalog": compact_catalog}, ensure_ascii=False
            )

            raw_response = client.chat(prompt, system_prompt)
            parsed = cls._parse_ai_json(raw_response)
            if parsed is None:
                return None

            ranked_ids = parsed.get("ranked_ids") or []
            confidence = (parsed.get("confidence") or "low").lower()
            clarifying_question = parsed.get("clarifying_question")

            score_by_id = {item["id"]: score for item, score in scored}
            catalog_by_id = {item["id"]: item for item in catalog}

            ordered_items = [
                catalog_by_id[rid] for rid in ranked_ids if rid in catalog_by_id
            ]
            if not ordered_items:
                return "none", [], None

            results = [
                cls._to_result(item, score_by_id.get(item["id"], 0.0))
                for item in ordered_items[:MAX_CHOOSE_RESULTS]
            ]

            if confidence == "high" and results:
                return "navigate", [results[0]], None

            return "choose", results, clarifying_question

        except Exception:
            frappe.log_error(
                title="Navigation AI resolve failed",
                message=frappe.get_traceback(),
            )
            return None

    @staticmethod
    def _parse_ai_json(raw_response: str) -> Optional[Dict[str, Any]]:
        """Robustly extract the JSON object the AI was asked to return, even
        if it added extra text/markdown fences around it."""
        if not raw_response:
            return None
        text = raw_response.strip()
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            pass

        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            return None
        try:
            return json.loads(match.group(0))
        except (ValueError, TypeError):
            return None
