from pydantic import BaseModel, Field


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    fullName: str | None = None
    name: str | None = None
    avatar_url: str | None = None

    # Student fields
    student_id: str | None = None
    studentId: str | None = None
    department: str | None = None
    course: str | None = None
    academic_year: str | None = None
    academicYear: str | None = None
    graduation_year: str | None = None
    graduationYear: str | None = None
    phone: str | None = None

    # Alumni fields
    alumni_id: str | None = None
    alumniId: str | None = None
    degree: str | None = None
    company: str | None = None
    designation: str | None = None
    industry: str | None = None
    location: str | None = None
    skills: list[str] | None = Field(default=None)
    linkedin: str | None = None
    github: str | None = None
    website: str | None = None
    bio: str | None = None
