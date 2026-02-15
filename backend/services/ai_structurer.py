"""AI-powered question structuring with Gemini (primary) + Kimi/Moonshot (fallback)."""

from google import genai
from google.genai import types
from openai import OpenAI
import json
import os
import re
import logging

logger = logging.getLogger(__name__)

# ─── Configure AI Clients ───

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
KIMI_API_KEY = os.getenv("KIMI_API_KEY", "")

gemini_client = None
if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)

kimi_client = None
if KIMI_API_KEY:
    kimi_client = OpenAI(
        api_key=KIMI_API_KEY,
        base_url="https://api.moonshot.cn/v1",
    )

# ─── Prompts ───

PARSE_QUESTIONS_PROMPT = """You are a quiz parser. Given raw text from a PDF question paper, 
extract ALL questions and their multiple-choice options (A, B, C, D).

Return ONLY a valid JSON array with this exact format (no markdown, no explanations):
[
  {{
    "question_number": 1,
    "question_text": "What is the capital of France?",
    "options": {{
      "A": "London",
      "B": "Paris",
      "C": "Berlin",
      "D": "Madrid"
    }}
  }}
]

Rules:
- Extract every question you can find
- If a question doesn't have clear options, still include it with empty option strings
- question_number must be sequential integers starting from 1
- Clean up any weird formatting or artifacts from PDF extraction
- Do NOT include the option letter in the option text (e.g., "Paris" not "B. Paris")

Raw text from PDF:
{text}"""


PARSE_ANSWER_KEY_PROMPT = """You are an answer key parser. Given raw text from an answer key PDF, 
extract the correct answer (A, B, C, or D) for each question number.

Return ONLY a valid JSON object mapping question numbers to correct options:
{{
  "1": "B",
  "2": "A",
  "3": "C"
}}

Rules:
- Keys must be question numbers as strings
- Values must be single uppercase letters: A, B, C, or D
- Extract ALL question-answer pairs you can find

Raw text from answer key PDF:
{text}"""


# ─── Helpers ───

def _clean_json_response(response_text: str) -> str:
    """Clean up AI response to extract valid JSON."""
    text = response_text.strip()
    
    # Remove markdown code fences
    if text.startswith("```"):
        text = re.sub(r'^```\w*\n?', '', text)
        text = re.sub(r'\n?```$', '', text)
        text = text.strip()
    
    # Try direct parse first
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass
    
    # Find the outermost JSON array or object using bracket matching
    for start_char, end_char in [('[', ']'), ('{', '}')]:
        start_idx = text.find(start_char)
        if start_idx == -1:
            continue
        
        depth = 0
        in_string = False
        escape_next = False
        
        for i in range(start_idx, len(text)):
            c = text[i]
            if escape_next:
                escape_next = False
                continue
            if c == '\\' and in_string:
                escape_next = True
                continue
            if c == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if c == start_char:
                depth += 1
            elif c == end_char:
                depth -= 1
                if depth == 0:
                    candidate = text[start_idx:i + 1]
                    try:
                        json.loads(candidate)
                        return candidate
                    except json.JSONDecodeError:
                        break
    
    # Last resort: return original text
    return text


def _call_kimi(prompt: str) -> str:
    """Call Kimi/Moonshot as fallback. Raises on failure."""
    if not kimi_client:
        raise RuntimeError("Kimi API key not configured")
    
    response = kimi_client.chat.completions.create(
        model="moonshot-v1-8k",
        messages=[
            {"role": "system", "content": "You are a precise JSON-only parser. Return only valid JSON, no markdown, no explanations."},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
    )
    return response.choices[0].message.content.strip()


def _call_ai_with_fallback(prompt: str) -> str:
    """Try multiple Gemini models (with thinking disabled), then fall back to Kimi."""
    # Gemini models to try in order (different models have separate quotas)
    gemini_models = ["gemini-2.5-flash", "gemini-2.0-flash"]
    
    if gemini_client:
        for model_name in gemini_models:
            try:
                logger.info(f"Trying Gemini model: {model_name}...")
                
                config_dict = {
                    "response_mime_type": "application/json",
                    "temperature": 0.1,
                }
                # Disable thinking for 2.5 models → much faster responses
                if "2.5" in model_name:
                    config_dict["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(**config_dict),
                )
                result = response.text.strip()
                logger.info(f"{model_name} succeeded ({len(result)} chars)")
                return result
            except Exception as e:
                error_str = str(e)
                if "429" in error_str or "ResourceExhausted" in error_str or "quota" in error_str.lower():
                    logger.warning(f"{model_name} rate limited, trying next...")
                else:
                    logger.warning(f"{model_name} failed: {error_str[:100]}, trying next...")
    
    # Fallback to Kimi/Moonshot
    if KIMI_API_KEY and kimi_client:
        try:
            logger.info("Trying Kimi/Moonshot...")
            result = _call_kimi(prompt)
            logger.info("Kimi succeeded")
            return result
        except Exception as e:
            logger.warning(f"Kimi failed: {str(e)[:80]}")
    
    raise RuntimeError("All AI providers failed. Check your API keys or wait for quota reset.")


# ─── Public API ───

def structure_questions_with_ai(raw_text: str) -> list[dict]:
    """Send extracted text to AI to structure into questions JSON."""
    prompt = PARSE_QUESTIONS_PROMPT.format(text=raw_text[:15000])
    
    response_text = _call_ai_with_fallback(prompt)
    cleaned = _clean_json_response(response_text)
    
    try:
        questions = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        logger.error(f"Response (first 500): {repr(cleaned[:500])}")
        raise ValueError(f"Failed to parse AI response as JSON: {e}")
    
    if not isinstance(questions, list):
        # Model may wrap questions in a dict like {"questions": [...]}
        if isinstance(questions, dict):
            for val in questions.values():
                if isinstance(val, list):
                    questions = val
                    break
    
    if not isinstance(questions, list):
        raise ValueError(f"Expected JSON array, got {type(questions).__name__}")
    
    # Validate structure
    validated = []
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            continue
        validated.append({
            "question_number": q.get("question_number", i + 1),
            "question_text": q.get("question_text", ""),
            "options": {
                "A": q.get("options", {}).get("A", ""),
                "B": q.get("options", {}).get("B", ""),
                "C": q.get("options", {}).get("C", ""),
                "D": q.get("options", {}).get("D", ""),
            }
        })
    
    return validated


def parse_answer_key_with_ai(raw_text: str) -> dict[str, str]:
    """Send answer key text to AI to extract question-answer mapping."""
    prompt = PARSE_ANSWER_KEY_PROMPT.format(text=raw_text[:10000])
    
    response_text = _call_ai_with_fallback(prompt)
    cleaned = _clean_json_response(response_text)
    
    try:
        answer_map = json.loads(cleaned)
    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error for answer key: {e}")
        logger.error(f"Response (first 500): {repr(cleaned[:500])}")
        raise ValueError(f"Failed to parse answer key response: {e}")
    
    if not isinstance(answer_map, dict):
        raise ValueError(f"Expected JSON object, got {type(answer_map).__name__}")
    
    # Validate — ensure values are A/B/C/D
    validated = {}
    for k, v in answer_map.items():
        if isinstance(v, str) and v.upper() in ('A', 'B', 'C', 'D'):
            validated[str(k)] = v.upper()
    
    return validated
