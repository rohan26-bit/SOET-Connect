import re
from urllib.parse import urlparse
from pydantic import BaseModel, Field, field_validator


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    fullName: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, max_length=100)
    avatar_url: str | None = Field(default=None, max_length=3_000_000)

    # Student fields
    student_id: str | None = Field(default=None, max_length=50)
    studentId: str | None = Field(default=None, max_length=50)
    department: str | None = Field(default=None, max_length=100)
    course: str | None = Field(default=None, max_length=100)
    academic_year: str | None = Field(default=None, max_length=50)
    academicYear: str | None = Field(default=None, max_length=50)
    graduation_year: str | None = None
    graduationYear: str | None = None
    phone: str | None = None

    # Alumni fields
    alumni_id: str | None = Field(default=None, max_length=50)
    alumniId: str | None = Field(default=None, max_length=50)
    degree: str | None = Field(default=None, max_length=100)
    company: str | None = Field(default=None, max_length=100)
    designation: str | None = Field(default=None, max_length=100)
    industry: str | None = Field(default=None, max_length=100)
    location: str | None = Field(default=None, max_length=100)
    skills: list[str] | None = Field(default=None)
    linkedin: str | None = None
    github: str | None = None
    website: str | None = None
    bio: str | None = Field(default=None, max_length=2000)

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        digits = [c for c in trimmed if c.isdigit()]
        if not (7 <= len(digits) <= 15):
            raise ValueError("Phone number must contain between 7 and 15 digits.")
        if not re.match(r"^\+?[0-9\s\-()]+$", trimmed):
            raise ValueError("Phone number contains invalid characters.")
        return trimmed

    @field_validator("graduation_year", "graduationYear")
    @classmethod
    def validate_graduation_year(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if not trimmed.isdigit() or len(trimmed) != 4:
            raise ValueError("Graduation year must be a 4-digit year.")
        year = int(trimmed)
        if not (1970 <= year <= 2035):
            raise ValueError("Graduation year must be between 1970 and 2035.")
        return trimmed

    @field_validator("linkedin", "github", "website")
    @classmethod
    def validate_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        parsed = urlparse(trimmed)
        if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc:
            raise ValueError("URL must start with http:// or https:// and include a valid domain.")
        return trimmed

    @field_validator("avatar_url")
    @classmethod
    def validate_avatar_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        trimmed = v.strip()
        if not trimmed:
            return None
        if trimmed.startswith("data:image/"):
            return trimmed
        parsed = urlparse(trimmed)
        if parsed.scheme.lower() in {"http", "https"} and parsed.netloc:
            return trimmed
        raise ValueError("Avatar URL must be a valid http/https URL or an image data URI.")

    @field_validator("skills")
    @classmethod
    def validate_skills(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return None
        if len(v) > 50:
            raise ValueError("Maximum 50 skills allowed.")
        cleaned = []
        for item in v:
            if isinstance(item, str):
                s = item.strip()
                if s:
                    if len(s) > 50:
                        raise ValueError("Each skill must be 50 characters or less.")
                    cleaned.append(s)
        return cleaned
