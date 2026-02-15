def grade_attempt(user_answers: dict, correct_answers: dict) -> dict:
    """
    Grade a quiz attempt by comparing user answers against correct answers.
    
    Args:
        user_answers: {question_number: "A"/"B"/"C"/"D"} — from the attempt
        correct_answers: {question_number: "A"/"B"/"C"/"D"} — from the answer key
    
    Returns:
        {
            "score": int,
            "total": int,
            "percentage": float,
            "details": [
                {"q": 1, "user": "A", "correct": "B", "is_correct": False},
                ...
            ]
        }
    """
    details = []
    score = 0
    total = len(correct_answers)
    
    for q_num_str, correct_option in sorted(correct_answers.items(), key=lambda x: int(x[0])):
        q_num = int(q_num_str)
        user_option = user_answers.get(q_num) or user_answers.get(str(q_num))
        is_correct = user_option == correct_option if user_option else False
        
        if is_correct:
            score += 1
        
        details.append({
            "q": q_num,
            "user": user_option or None,
            "correct": correct_option,
            "is_correct": is_correct,
        })
    
    return {
        "score": score,
        "total": total,
        "percentage": round((score / total * 100), 1) if total > 0 else 0,
        "details": details,
    }
