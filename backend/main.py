"""PDF-to-Quiz Backend — FastAPI server for PDF parsing and grading."""

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from dotenv import load_dotenv
import os
import json
import hashlib
import logging
import traceback

load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Supabase client
from supabase import create_client, Client

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in backend/.env")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

# Import services
from services.pdf_parser import extract_text_from_pdf_url, extract_text_from_file, extract_answer_key_basic
from services.ai_structurer import structure_questions_with_ai, parse_answer_key_with_ai
from services.grader import grade_attempt

# ─── In-memory cache for parsed PDFs (keyed by text hash) ───
_pdf_cache: dict[str, list[dict]] = {}

# ─── App Setup ───

app = FastAPI(title="PDF-to-Quiz API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Request Models ───

class ParsePdfRequest(BaseModel):
    pdf_url: str
    quiz_id: str

class ParseAnswerKeyRequest(BaseModel):
    pdf_url: str
    quiz_id: str

class GradeQuizRequest(BaseModel):
    quiz_id: str
    attempt_id: str

# ─── Routes ───

@app.get("/")
def health_check():
    return {"status": "ok", "service": "PDF-to-Quiz API"}


@app.post("/api/parse-pdf")
async def parse_pdf(request: ParsePdfRequest):
    """
    Extract text from a PDF, send to Gemini Flash for structuring,
    and save parsed questions to Supabase.
    """
    try:
        # 1. Extract text from PDF
        logger.info(f"Parsing PDF from URL: {request.pdf_url[:80]}...")
        raw_text = extract_text_from_pdf_url(request.pdf_url)
        logger.info(f"Extracted {len(raw_text)} chars from PDF")
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF. The PDF might be image-based.")
        
        # 2. Structure with Gemini Flash
        logger.info("Sending to Gemini for structuring...")
        questions = structure_questions_with_ai(raw_text)
        logger.info(f"Gemini returned {len(questions)} questions")
        if not questions:
            raise HTTPException(status_code=400, detail="AI could not parse questions from the text")
        
        # 3. Save to Supabase (questions table)
        rows = []
        for q in questions:
            rows.append({
                "quiz_id": request.quiz_id,
                "question_number": q["question_number"],
                "question_text": q["question_text"],
                "options": q["options"],
                "correct_option": None,
            })
        
        result = supabase.table("questions").insert(rows).execute()
        logger.info(f"Inserted {len(rows)} questions into Supabase")
        
        # 4. Update quiz status and total questions
        supabase.table("quizzes").update({
            "status": "review",
            "total_questions": len(questions),
        }).eq("id", request.quiz_id).execute()
        
        return {
            "success": True,
            "total_questions": len(questions),
            "questions": questions,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parse_pdf error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {str(e)}")


@app.post("/api/parse-pdf-upload")
async def parse_pdf_upload(file: UploadFile = File(...), quiz_id: str = Form(...)):
    """
    Accept direct PDF file upload, extract text, structure with AI,
    and save parsed questions to Supabase. This bypasses URL download issues.
    """
    try:
        logger.info(f"Parsing uploaded PDF: {file.filename}, quiz_id: {quiz_id}")
        file_bytes = await file.read()
        
        # 1. Extract text from uploaded file bytes
        raw_text = extract_text_from_file(file_bytes)
        logger.info(f"Extracted {len(raw_text)} chars from uploaded PDF")
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF. The PDF might be image-based.")
        
        # 2. Check cache or structure with AI
        text_hash = hashlib.sha256(raw_text.encode()).hexdigest()
        if text_hash in _pdf_cache:
            questions = _pdf_cache[text_hash]
            logger.info(f"Cache hit! Reusing {len(questions)} cached questions")
        else:
            logger.info("Sending to AI for structuring...")
            questions = structure_questions_with_ai(raw_text)
            if not questions:
                raise HTTPException(status_code=400, detail="AI could not parse questions from the text")
            _pdf_cache[text_hash] = questions
            logger.info(f"AI returned {len(questions)} questions (cached)")

        # 3. Save to Supabase (questions table)
        rows = []
        for q in questions:
            rows.append({
                "quiz_id": quiz_id,
                "question_number": q["question_number"],
                "question_text": q["question_text"],
                "options": q["options"],
                "correct_option": None,
            })

        result = supabase.table("questions").insert(rows).execute()
        logger.info(f"Inserted {len(rows)} questions into Supabase")

        # 4. Update quiz status and total questions
        supabase.table("quizzes").update({
            "status": "review",
            "total_questions": len(questions),
        }).eq("id", quiz_id).execute()

        return {
            "success": True,
            "total_questions": len(questions),
            "questions": questions,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parse_pdf_upload error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"PDF parsing failed: {str(e)}")


@app.post("/api/parse-pdf-upload-stream")
async def parse_pdf_upload_stream(file: UploadFile = File(...), quiz_id: str = Form(...)):
    """
    Same as parse-pdf-upload but streams progress events via SSE.
    """
    async def event_stream():
        try:
            def send_event(stage: str, message: str, **extra):
                data = {"stage": stage, "message": message, **extra}
                return f"data: {json.dumps(data)}\n\n"

            yield send_event("uploading", "Reading uploaded file...")
            file_bytes = await file.read()

            yield send_event("extracting", "Extracting text from PDF...")
            raw_text = extract_text_from_file(file_bytes)
            if not raw_text.strip():
                yield send_event("error", "Could not extract text from PDF. The PDF might be image-based.")
                return

            char_count = len(raw_text)
            text_hash = hashlib.sha256(raw_text.encode()).hexdigest()

            if text_hash in _pdf_cache:
                questions = _pdf_cache[text_hash]
                yield send_event("ai_processing", f"Found cached results for this PDF! ({len(questions)} questions)")
            else:
                yield send_event("ai_processing", f"Structuring questions with AI... ({char_count} chars extracted)")
                questions = structure_questions_with_ai(raw_text)
                if questions:
                    _pdf_cache[text_hash] = questions

            if not questions:
                yield send_event("error", "AI could not parse questions from the text")
                return

            yield send_event("saving", f"Saving {len(questions)} questions to database...")

            rows = []
            for q in questions:
                rows.append({
                    "quiz_id": quiz_id,
                    "question_number": q["question_number"],
                    "question_text": q["question_text"],
                    "options": q["options"],
                    "correct_option": None,
                })

            supabase.table("questions").insert(rows).execute()

            supabase.table("quizzes").update({
                "status": "review",
                "total_questions": len(questions),
            }).eq("id", quiz_id).execute()

            yield send_event("complete", "Quiz ready!", total_questions=len(questions))

        except Exception as e:
            logger.error(f"parse_pdf_upload_stream error: {traceback.format_exc()}")
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/parse-answer-key-upload")
async def parse_answer_key_upload(file: UploadFile = File(...), quiz_id: str = Form(...)):
    """
    Accept direct answer key PDF upload, parse answers, and update questions.
    """
    try:
        logger.info(f"Parsing answer key upload: {file.filename}, quiz_id: {quiz_id}")
        file_bytes = await file.read()
        
        # 1. Extract text
        raw_text = extract_text_from_file(file_bytes)
        logger.info(f"Extracted {len(raw_text)} chars from answer key")
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from answer key PDF")
        
        # 2. Parse with AI (primary) and regex (fallback)
        try:
            answer_map = parse_answer_key_with_ai(raw_text)
            logger.info(f"AI parsed {len(answer_map)} answers")
        except Exception as e:
            logger.warning(f"AI answer key parsing failed: {e}, falling back to regex")
            answer_map = {}
        
        # Fallback: regex extraction
        if not answer_map:
            answer_map_int = extract_answer_key_basic(raw_text)
            answer_map = {str(k): v for k, v in answer_map_int.items()}
            logger.info(f"Regex parsed {len(answer_map)} answers")
        
        if not answer_map:
            raise HTTPException(status_code=400, detail="Could not parse answer key from PDF")
        
        # 3. Update questions in Supabase (batch by correct_option value)
        result = supabase.table("questions") \
            .select("id, question_number") \
            .eq("quiz_id", quiz_id) \
            .execute()

        # Group question IDs by their correct option to minimize HTTP calls
        option_groups: dict[str, list[str]] = {}
        for q_row in result.data:
            q_num = str(q_row["question_number"])
            if q_num in answer_map:
                opt = answer_map[q_num]
                option_groups.setdefault(opt, []).append(q_row["id"])

        updated_count = 0
        for opt_value, q_ids in option_groups.items():
            supabase.table("questions") \
                .update({"correct_option": opt_value}) \
                .in_("id", q_ids) \
                .execute()
            updated_count += len(q_ids)

        logger.info(f"Updated {updated_count} questions with answers in {len(option_groups)} batch(es)")

        return {
            "success": True,
            "total_answers": len(answer_map),
            "updated_questions": updated_count,
            "answer_map": answer_map,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parse_answer_key_upload error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Answer key parsing failed: {str(e)}")


@app.post("/api/parse-answer-key")
async def parse_answer_key(request: ParseAnswerKeyRequest):
    """
    Extract answer key from PDF: first try Gemini Flash, fallback to regex.
    Updates the 'correct_option' field in the questions table.
    """
    try:
        # 1. Extract text
        raw_text = extract_text_from_pdf_url(request.pdf_url)
        if not raw_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from answer key PDF")
        
        # 2. Parse with AI (primary) and regex (fallback)
        try:
            answer_map = parse_answer_key_with_ai(raw_text)
        except Exception:
            answer_map = {}
        
        # Fallback: regex extraction
        if not answer_map:
            answer_map_int = extract_answer_key_basic(raw_text)
            answer_map = {str(k): v for k, v in answer_map_int.items()}
        
        if not answer_map:
            raise HTTPException(status_code=400, detail="Could not parse answer key from PDF")
        
        # 3. Update questions in Supabase (batch by correct_option value)
        result = supabase.table("questions") \
            .select("id, question_number") \
            .eq("quiz_id", request.quiz_id) \
            .execute()

        option_groups: dict[str, list[str]] = {}
        for q_row in result.data:
            q_num = str(q_row["question_number"])
            if q_num in answer_map:
                opt = answer_map[q_num]
                option_groups.setdefault(opt, []).append(q_row["id"])

        updated_count = 0
        for opt_value, q_ids in option_groups.items():
            supabase.table("questions") \
                .update({"correct_option": opt_value}) \
                .in_("id", q_ids) \
                .execute()
            updated_count += len(q_ids)

        return {
            "success": True,
            "total_answers": len(answer_map),
            "updated_questions": updated_count,
            "answer_map": answer_map,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"parse_answer_key error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Answer key parsing failed: {str(e)}")


@app.post("/api/grade-quiz")
async def grade_quiz(request: GradeQuizRequest):
    """
    Grade a quiz attempt by comparing user answers with correct answers.
    """
    try:
        # 1. Get the attempt
        attempt_result = supabase.table("attempts") \
            .select("*") \
            .eq("id", request.attempt_id) \
            .single() \
            .execute()
        
        if not attempt_result.data:
            raise HTTPException(status_code=404, detail="Attempt not found")
        
        user_answers = attempt_result.data.get("answers", {})
        
        # 2. Get correct answers from questions
        questions_result = supabase.table("questions") \
            .select("question_number, correct_option") \
            .eq("quiz_id", request.quiz_id) \
            .execute()
        
        correct_answers = {}
        for q_row in questions_result.data:
            if q_row.get("correct_option"):
                correct_answers[str(q_row["question_number"])] = q_row["correct_option"]
        
        if not correct_answers:
            raise HTTPException(status_code=400, detail="No answer key available for this quiz")
        
        # 3. Grade
        result = grade_attempt(user_answers, correct_answers)
        
        # 4. Update attempt in Supabase
        supabase.table("attempts") \
            .update({
                "score": result["score"],
                "is_graded": True,
            }) \
            .eq("id", request.attempt_id) \
            .execute()
        
        return {
            "success": True,
            **result,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"grade_quiz error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Grading failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
