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

    @field_validator(
        "student_id", "department", "course", "academic_year", "graduation_year", "phone",
        mode="before"
    )
    @classmethod
    def trim_student_registration_fields(cls, value):
        return value.strip() if isinstance(value, str) else value

    @field_validator("alumni_id", mode="before")
    @classmethod
    def trim_alumni_id(cls, value):
        return value.strip() if isinstance(value, str) else value

    @model_validator(mode="after")
    def validate_role_specific_registration_fields(self) -> "RegisterRequest":
        if self.role == "alumni":
            if not all(character.isalpha() or character == ' ' for character in self.name):
                raise ValueError("Alumni full name must contain letters and spaces only.")

            if not self.alumni_id:
                raise ValueError("Alumni ID / PRN is required.")

            if not self.alumni_id.isascii() or not self.alumni_id.isdigit():
                raise ValueError("Alumni ID / PRN must contain numbers only.")

        if self.role == "student":
            required_fields = [
                ("student_id", "Student ID / PRN"),
                ("department", "Department"),
                ("course", "Course"),
                ("academic_year", "Academic Year"),
                ("graduation_year", "Graduation Year"),
                ("phone", "Phone Number"),
            ]
            missing_fields = [
                label
                for field, label in required_fields
                if not getattr(self, field) or not getattr(self, field).strip()
            ]
            if missing_fields:
                raise ValueError(
                    "The following student registration fields are required: "
                    + ", ".join(missing_fields)
                    + "."
                )

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


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=128)
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_new_password: str = Field(..., min_length=8, max_length=128)