from datetime import datetime, timezone


USER_ROLES = {
    "student",
    "alumni",
    "admin"
}


def create_user_document(
    name: str,
    email: str,
    password_hash: str,
    role: str,
    student_id=None,
    department=None,
    course=None,
    academic_year=None,
    graduation_year=None,
    phone=None,
    alumni_id=None,
    degree=None,
    company=None,
    designation=None,
    industry=None,
    location=None,
    skills=None,
    linkedin=None,
    github=None,
    website=None,
    bio=None
):
    if role not in USER_ROLES:
        raise ValueError("Invalid user role")

    now = datetime.now(timezone.utc)

    # Admin is pre-verified; student and alumni accounts remain pending until approved
    if role == "admin":
        is_verified = True
        verification_status = "approved"
    else:
        is_verified = False
        verification_status = "pending"

    document = {
        "name": name,
        "email": email.lower().strip(),
        "password_hash": password_hash,
        "role": role,
        "is_active": True,
        "is_verified": is_verified,
        "verification_status": verification_status,
        "created_at": now,
        "updated_at": now
    }

    if role == "student":
        document["student_profile"] = {
            "student_id": student_id,
            "department": department,
            "course": course,
            "academic_year": academic_year,
            "graduation_year": graduation_year,
            "phone": phone
        }

    elif role == "alumni":
        document["alumni_profile"] = {
            "alumni_id": alumni_id,
            "department": department,
            "degree": degree,
            "graduation_year": graduation_year,
            "company": company,
            "designation": designation,
            "industry": industry,
            "location": location,
            "skills": skills or [],
            "linkedin": linkedin,
            "github": github,
            "website": website,
            "bio": bio
        }

    return document