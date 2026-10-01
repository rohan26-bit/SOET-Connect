import { useState } from "react";
import { Link } from "react-router-dom";
import { LogIn, Lock, Mail, AlertCircle, Info } from "lucide-react";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";
import authService from "../services/auth";

function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [serverNotice, setServerNotice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = () => {
    const newErrors = {};
    const emailTrimmed = formData.email.trim();

    if (!emailTrimmed) {
      newErrors.email = "Email address is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (!formData.password) {
      newErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      newErrors.password = "Password must be at least 8 characters";
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
    setServerNotice("");

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      // Calls authService.login which checks backend status
      await authService.login(formData);
      // NOTE: If backend later returns a real token, handle token storage here.
    } catch (err) {
      // Accurately reports backend status without faking authentication
      setServerNotice(
        err.message ||
          "Authentication endpoint (POST /auth/login) is not yet implemented on the backend server."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-title-section">
        <h1>Welcome Back</h1>
        <p>Sign in to your SOET Connect account</p>
      </div>

      <div className="auth-alert info" role="status">
        <Info size={18} aria-hidden="true" />
        <span>
          <strong>Backend Status:</strong> User registration (<code>POST /auth/register</code>) is live, but JWT login (<code>POST /auth/login</code>) is awaiting deployment from the backend team.
        </span>
      </div>

      {serverNotice && (
        <div className="auth-alert error" role="alert">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{serverNotice}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="auth-form" noValidate>
        <Input
          id="login-email"
          name="email"
          type="email"
          label="Email Address"
          placeholder="you@example.com"
          value={formData.email}
          onChange={handleChange}
          error={errors.email}
          icon={Mail}
          autoComplete="email"
          required
        />

        <Input
          id="login-password"
          name="password"
          type="password"
          label="Password"
          placeholder="••••••••"
          value={formData.password}
          onChange={handleChange}
          error={errors.password}
          icon={Lock}
          autoComplete="current-password"
          required
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          icon={LogIn}
          loading={isSubmitting}
          className="auth-submit-btn"
        >
          {isSubmitting ? "Verifying..." : "Sign In"}
        </Button>

        <div className="auth-links-row">
          <Link to="/dashboard" className="guest-link">
            Explore Dashboard as Guest →
          </Link>
        </div>

        <div className="auth-switch">
          <span>Don't have an account? </span>
          <Link to="/register">Create an account</Link>
        </div>
      </form>
    </div>
  );
}

export default Login;
