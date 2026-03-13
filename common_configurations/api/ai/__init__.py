"""
AI Domain

Utility clients for AI providers (OpenAI, Anthropic, Google).

Usage from any Python code:
	from common_configurations.api.ai import get_ai_client

	client = get_ai_client("My OpenAI Config")
	response = client.chat("Translate this to English: Hola mundo")
"""

from .client_factory import get_ai_client

__all__ = ["get_ai_client"]
