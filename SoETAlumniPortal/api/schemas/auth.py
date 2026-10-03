from typing import Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    role: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        trimmed = v.strip()
        if len(trimmed) < 2:
            raise ValueError("Name must be at least 2 characters long and cannot be whitespace only.")
        if len(trimmed) > 100:
            raise ValueError("Name cannot exceed 100 characters.")
        return trimmed

    @model_validator(mode="after")
    def validate_alumni_id_required(self) -> "RegisterRequest":
        if self.role == "alumni":
            if not self.alumni_id or not self.alumni_id.strip():
                raise ValueError("Alumni ID / PRN is required.")
        return self

    # Admin registration
    admin_secret: Optional[str] = None

    # Student fields
    student_id: Optional[str] = None
    department: Optional[str] = None
    course: Optional[str] = None
    academic_year: Optional[str] = None
    graduation_year: Optional[str] = None
    phone: Optional[str] = None

    # Alumni fields
    alumni_id: Optional[str] = None
    degree: Optional[str] = None
    company: Optional[str] = None
    designation: Optional[str] = None
    industry: Optional[str] = None
    location: Optional[str] = None
    skills: Optional[list[str]] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    website: Optional[str] = None
    bio: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., max_length=128)