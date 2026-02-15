import pdfplumber
import io
import requests
import re


def extract_text_from_pdf_url(pdf_url: str) -> str:
    """Download PDF from URL and extract text using pdfplumber."""
    response = requests.get(pdf_url)
    response.raise_for_status()
    
    text_parts = []
    with pdfplumber.open(io.BytesIO(response.content)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    
    return "\n\n".join(text_parts)


def extract_text_from_file(file_bytes: bytes) -> str:
    """Extract text from PDF file bytes using pdfplumber."""
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    
    return "\n\n".join(text_parts)


def extract_answer_key_basic(text: str) -> dict[int, str]:
    """
    Basic regex extraction for answer keys.
    Patterns supported:
      - "1. B", "1) B", "1: B", "1 B"
      - "Q1: B", "Q.1 B"
      - "1. (B)", "1) [B]"
    """
    answers = {}
    
    patterns = [
        r'(?:Q\.?\s*)?(\d+)\s*[.):\-]\s*\(?([A-Da-d])\)?',
        r'(\d+)\s+([A-Da-d])\b',
    ]
    
    for pattern in patterns:
        matches = re.findall(pattern, text)
        for num_str, option in matches:
            num = int(num_str)
            if 1 <= num <= 300:
                answers[num] = option.upper()
    
    return answers
