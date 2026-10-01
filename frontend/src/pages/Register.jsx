import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { UserPlus, User, Mail, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import authService from "../services/auth";

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "student",
  });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    const nameTrimmed = formData.name.trim();
    const emailTrimmed = formData.email.trim();

    if (!nameTrimmed) {
      newErrors.name = "Full name is required";
    } else if (nameTrimmed.length < 2) {
      newErrors.name = "Name must be at least 2 characters";
    } else if (nameTrimmed.length > 100) {
      newErrors.name = "Name cannot exceed 100 characters";
    }

    if (!emailTrimmed) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
    } else if (formData.password.length > 100) {
      newErrors.password = "Password cannot exceed 100 characters";
    }

    if (!["student", "alumni"].includes(formData.role)) {
      newErrors.role = "Role must be 'student' or 'alumni'";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setSuccessMessage("");

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const data = await authService.register({
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
      });

      setSuccessMessage(
        data?.message || "Registration successful! You may now sign in."
      );
      setTimeout(() => {
        navigate("/login");
      }, 2500);
    } catch (err) {
      setServerError(
        err.message ||
          "Could not reach backend server. Please verify backend is running."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-title-section">
        <h1>Create Account</h1>
        <p>Join the SOET community as a Student or Alumni</p>
      </div>

      {serverError && (
        <div className="auth-alert error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      {successMessage && (
        <div className="auth-alert success" role="alert">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          id="reg-name"
          name="name"
          type="text"
          label="Full Name"
          placeholder="e.g. Alex Morgan"
          value={formData.name}
          onChange={handleChange}
          error={errors.name}
          icon={User}
          autoComplete="name"
          required
        />

        <Input
          id="reg-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="alex@university.edu"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          icon={Mail}
          autoComplete="email"
          required
        />

        <Input
          id="reg-password"
          name="password"
          type="password"
          label="Password"
          placeholder="Minimum 8 characters"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          icon={Lock}
          autoComplete="new-password"
          required
        />

        <div className="form-group">
          <label id="role-selection-label" className="form-label">
            Select Your Role <span className="required-indicator" aria-hidden="true">*</span>
          </label>
          <div
            className="role-selector"
            role="radiogroup"
            aria-labelledby="role-selection-label"
          >
            <label
              className={`role-option ${
                formData.role === "student" ? "selected" : ""
              }`}
            >
              <input
                type="radio"
                name="role"
                value="student"
                checked={formData.role === "student"}
                onChange={handleChange}
              />
              <span className="role-title">Student</span>
              <span className="role-desc">
                Current student seeking mentorship, events, and job postings
              </span>
            </label>

            <label
              className={`role-option ${
                formData.role === "alumni" ? "selected" : ""
              }`}
            >
              <input
                type="radio"
                name="role"
                value="alumni"
                checked={formData.role === "alumni"}
                onChange={handleChange}
              />
              <span className="role-title">Alumni</span>
              <span className="role-desc">
                Graduated professional connecting with peers and mentoring students
              </span>
            </label>
          </div>
          {errors.role && (
            <span id="role-error" className="form-error" role="alert">
              {errors.role}
            </span>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          icon={UserPlus}
          loading={isSubmitting}
          className="auth-submit-btn"
        >
          {isSubmitting ? "Creating Account..." : "Create Account"}
        </Button>

        <div className="auth-links-row">
          <Link to="/dashboard" className="guest-link">
            Explore Dashboard as Guest →
          </Link>
        </div>

        <div className="auth-switch">
          <span>Already have an account? </span>
          <Link to="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}

export default Register;
