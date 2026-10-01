import { useState, useMemo } from "react";
import {
  GraduationCap,
  Briefcase,
  MapPin,
  Mail,
  Calendar,
  Sparkles,
  Plus,
  X,
  ExternalLink,
  Globe,
  Link2,
  Edit3,
  CheckCircle2,
  AlertCircle,
  Info,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Input from "../components/ui/Input";
import Modal from "../components/ui/Modal";
import Toast from "../components/ui/Toast";
import { demoStudentProfile, demoAlumniProfile } from "../data/mockData";

function Profile() {
  // Demo persona selector: "student" or "alumni"
  const [activePersona, setActivePersona] = useState("student");

  // Local React session state for student and alumni demo profiles
  const [studentData, setStudentData] = useState(demoStudentProfile);
  const [alumniData, setAlumniData] = useState(demoAlumniProfile);

  // Active profile currently viewed
  const profile = activePersona === "student" ? studentData : alumniData;

  // Modal and toast state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState("success");

  // Edit form state & client-side validation errors
  const [editForm, setEditForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // Inline skill addition state
  const [newSkillText, setNewSkillText] = useState("");
  const [skillError, setSkillError] = useState("");

  // Helper to trigger toast
  const showToast = (message, type = "success") => {
    setToastMessage(message);
    setToastType(type);
  };

  // Helper to get initials
  const initials = useMemo(() => {
    if (!profile.name) return "U";
    return profile.name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .substring(0, 2)
      .toUpperCase();
  }, [profile.name]);

  // Profile completion calculation based on genuinely implemented fields
  const completionData = useMemo(() => {
    const checks = [
      {
        id: "basic",
        label: "Basic Information (Name, Email, Location)",
        isComplete: Boolean(
          profile.name &&
            profile.name.trim() &&
            profile.email &&
            profile.email.trim() &&
            profile.location &&
            profile.location.trim()
        ),
      },
      {
        id: "bio",
        label: "About & Bio (At least 20 characters)",
        isComplete: Boolean(profile.bio && profile.bio.trim().length >= 20),
      },
      {
        id: "academic",
        label: "Academic Details (Degree, Department, Graduation Year)",
        isComplete: Boolean(
          profile.degree &&
            profile.degree.trim() &&
            profile.department &&
            profile.department.trim() &&
            profile.graduationYear
        ),
      },
      {
        id: "professional",
        label: "Professional Details (Current Role & Company)",
        isComplete: Boolean(
          profile.currentRole &&
            profile.currentRole.trim() &&
            profile.company &&
            profile.company.trim()
        ),
      },
      {
        id: "skills",
        label: "Skills & Expertise (At least 3 skills listed)",
        isComplete: Boolean(
          Array.isArray(profile.skills) && profile.skills.length >= 3
        ),
      },
      {
        id: "social",
        label: "Social / External Profile Links (At least 1 link)",
        isComplete: Boolean(
          (profile.linkedin && profile.linkedin.trim()) ||
            (profile.github && profile.github.trim()) ||
            (profile.website && profile.website.trim())
        ),
      },
    ];

    const completedCount = checks.filter((c) => c.isComplete).length;
    const totalCount = checks.length;
    const percentage = Math.round((completedCount / totalCount) * 100);
    const missing = checks.filter((c) => !c.isComplete);

    return {
      checks,
      completedCount,
      totalCount,
      percentage,
      missing,
    };
  }, [profile]);

  // Handle switching personas
  const handlePersonaSwitch = (newPersona) => {
    if (newPersona === activePersona) return;
    setActivePersona(newPersona);
    setSkillError("");
    setNewSkillText("");
    showToast(
      `Switched to Demo ${newPersona === "student" ? "Student" : "Alumni"} Profile view.`,
      "info"
    );
  };

  // Open Edit Modal with current profile values cloned
  const handleOpenEditModal = () => {
    setEditForm({
      name: profile.name || "",
      email: profile.email || "",
      location: profile.location || "",
      bio: profile.bio || "",
      department: profile.department || "",
      degree: profile.degree || "",
      graduationYear: profile.graduationYear ? String(profile.graduationYear) : "",
      currentSemester: profile.currentSemester || "",
      currentRole: profile.currentRole || "",
      company: profile.company || "",
      experienceSummary: profile.experienceSummary || "",
      linkedin: profile.linkedin || "",
      github: profile.github || "",
      website: profile.website || "",
    });
    setFormErrors({});
    setIsEditModalOpen(true);
  };

  // Client-side validation for edit form
  const validateForm = (data) => {
    const errors = {};

    if (!data.name || !data.name.trim()) {
      errors.name = "Full name is required.";
    } else if (data.name.trim().length < 2) {
      errors.name = "Full name must be at least 2 characters.";
    }

    if (!data.email || !data.email.trim()) {
      errors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
      errors.email = "Please enter a valid email address.";
    }

    if (!data.department || !data.department.trim()) {
      errors.department = "Department is required.";
    }

    if (!data.degree || !data.degree.trim()) {
      errors.degree = "Degree / Program is required.";
    }

    if (!data.graduationYear || !data.graduationYear.trim()) {
      errors.graduationYear = "Graduation year is required.";
    } else {
      const year = parseInt(data.graduationYear, 10);
      if (isNaN(year) || year < 1980 || year > 2035) {
        errors.graduationYear = "Graduation year must be between 1980 and 2035.";
      }
    }

    if (data.bio && data.bio.trim().length > 500) {
      errors.bio = "Bio cannot exceed 500 characters.";
    }

    const validateUrl = (url, fieldName, label) => {
      if (!url || !url.trim()) return;
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        errors[fieldName] = `${label} must start with http:// or https://`;
      }
    };

    validateUrl(data.linkedin, "linkedin", "LinkedIn URL");
    validateUrl(data.github, "github", "GitHub URL");
    validateUrl(data.website, "website", "Portfolio / Website URL");

    return errors;
  };

  // Handle Edit Profile submission (Local state save ONLY - zero fake backend calls)
  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!editForm) return;

    const errors = validateForm(editForm);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    const updatedProfile = {
      ...profile,
      name: editForm.name.trim(),
      email: editForm.email.trim(),
      location: editForm.location.trim(),
      bio: editForm.bio.trim(),
      department: editForm.department.trim(),
      degree: editForm.degree.trim(),
      graduationYear: parseInt(editForm.graduationYear, 10),
      currentSemester: editForm.currentSemester.trim() || null,
      currentRole: editForm.currentRole.trim(),
      company: editForm.company.trim(),
      experienceSummary: editForm.experienceSummary.trim(),
      linkedin: editForm.linkedin.trim() || null,
      github: editForm.github.trim() || null,
      website: editForm.website.trim() || null,
    };

    if (activePersona === "student") {
      setStudentData(updatedProfile);
    } else {
      setAlumniData(updatedProfile);
    }

    setIsEditModalOpen(false);
    showToast(
      "Demo profile updated locally! Note: Changes are stored in this browser session only and will not persist to a remote database.",
      "success"
    );
  };

  // Reset to initial demo default
  const handleResetDefaults = () => {
    if (activePersona === "student") {
      setStudentData(demoStudentProfile);
    } else {
      setAlumniData(demoAlumniProfile);
    }
    showToast(
      `Reset Demo ${activePersona === "student" ? "Student" : "Alumni"} Profile back to default mock data.`,
      "info"
    );
  };

  // Inline Skills Management: Add Skill
  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkillText.trim();

    if (!trimmed) {
      setSkillError("Skill name cannot be empty.");
      return;
    }

    if (trimmed.length > 30) {
      setSkillError("Skill name cannot exceed 30 characters.");
      return;
    }

    const currentSkills = profile.skills || [];
    const isDuplicate = currentSkills.some(
      (s) => s.toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setSkillError(`"${trimmed}" is already in your skills list.`);
      return;
    }

    const updatedSkills = [...currentSkills, trimmed];
    const updatedProfile = { ...profile, skills: updatedSkills };

    if (activePersona === "student") {
      setStudentData(updatedProfile);
    } else {
      setAlumniData(updatedProfile);
    }

    setNewSkillText("");
    setSkillError("");
    showToast(`Added "${trimmed}" to demo skills.`, "success");
  };

  // Inline Skills Management: Remove Skill
  const handleRemoveSkill = (skillToRemove) => {
    const currentSkills = profile.skills || [];
    const updatedSkills = currentSkills.filter((s) => s !== skillToRemove);
    const updatedProfile = { ...profile, skills: updatedSkills };

    if (activePersona === "student") {
      setStudentData(updatedProfile);
    } else {
      setAlumniData(updatedProfile);
    }

    showToast(`Removed "${skillToRemove}" from skills.`, "info");
  };

  return (
    <div className="profile-page">
      {/* Toast notifications */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage(null)}
          duration={5000}
        />
      )}

      {/* Honest Demo Mode Banner */}
      <div className="profile-demo-banner" role="status" aria-label="Demo notice">
        <div className="demo-banner-content">
          <Info size={18} className="demo-banner-icon" aria-hidden="true" />
          <div>
            <strong>Demo Profile Mode:</strong> Operating in local demonstration mode.
            Backend profile endpoints (<code>/auth/me</code>, <code>/profile</code>) are not yet available on the API.
            Any updates made here are stored in local frontend state for this session only.
          </div>
        </div>

        {/* Persona Switcher */}
        <div className="persona-toggle-group" aria-label="Select demo profile persona">
          <button
            type="button"
            className={`persona-toggle-btn ${activePersona === "student" ? "active" : ""}`}
            onClick={() => handlePersonaSwitch("student")}
            aria-pressed={activePersona === "student"}
          >
            <GraduationCap size={15} aria-hidden="true" />
            <span>Demo Student</span>
          </button>
          <button
            type="button"
            className={`persona-toggle-btn ${activePersona === "alumni" ? "active" : ""}`}
            onClick={() => handlePersonaSwitch("alumni")}
            aria-pressed={activePersona === "alumni"}
          >
            <Briefcase size={15} aria-hidden="true" />
            <span>Demo Alumni</span>
          </button>
        </div>
      </div>

      {/* Main Profile Hero Header */}
      <div className="profile-hero-card">
        <div className="profile-hero-cover" aria-hidden="true">
          <div className="profile-hero-pattern"></div>
        </div>

        <div className="profile-hero-main">
          <div className="profile-avatar-container">
            <div className="profile-hero-avatar" aria-hidden="true">
              {initials}
            </div>
            {profile.isVerified && (
              <span
                className="profile-verified-badge"
                title="Verified SOET Community Member"
                aria-label="Verified member"
              >
                <ShieldCheck size={16} aria-hidden="true" />
              </span>
            )}
          </div>

          <div className="profile-hero-details">
            <div className="profile-title-row">
              <div>
                <div className="profile-name-role">
                  <h1>{profile.name}</h1>
                  <span
                    className={`profile-role-badge badge-${activePersona}`}
                  >
                    {activePersona === "student" ? "Current Student" : "SOET Alumnus"}
                  </span>
                </div>
                <p className="profile-headline">{profile.currentRole} at {profile.company}</p>
              </div>

              <div className="profile-hero-actions">
                <Button
                  variant="primary"
                  icon={Edit3}
                  onClick={handleOpenEditModal}
                  aria-label="Edit demo profile"
                >
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  icon={RefreshCw}
                  onClick={handleResetDefaults}
                  title="Reset profile values back to demo defaults"
                  aria-label="Reset demo profile defaults"
                >
                  Reset Demo
                </Button>
              </div>
            </div>

            <div className="profile-meta-chips">
              <span className="profile-meta-item">
                <GraduationCap size={15} aria-hidden="true" />
                <span>{profile.degree} &bull; {profile.department}</span>
              </span>
              <span className="profile-meta-item">
                <Calendar size={15} aria-hidden="true" />
                <span>
                  {activePersona === "student"
                    ? `Graduating ${profile.graduationYear}`
                    : `Class of ${profile.graduationYear}`}
                  {profile.currentSemester ? ` (${profile.currentSemester})` : ""}
                </span>
              </span>
              {profile.location && (
                <span className="profile-meta-item">
                  <MapPin size={15} aria-hidden="true" />
                  <span>{profile.location}</span>
                </span>
              )}
              {profile.email && (
                <span className="profile-meta-item">
                  <Mail size={15} aria-hidden="true" />
                  <span>{profile.email}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Main Content + Sidebar Overview */}
      <div className="profile-layout-grid">
        {/* Left Column: Deep Details */}
        <div className="profile-main-column">
          {/* About / Bio Section */}
          <Card
            title="About & Bio"
            subtitle="Background summary and academic interests"
            className="profile-section-card"
          >
            <p className="profile-bio-text">
              {profile.bio || "No biography provided yet. Click 'Edit Profile' to add a summary."}
            </p>
          </Card>

          {/* Academic Information */}
          <Card
            title="Academic Information"
            subtitle="Degree, department, and graduation records"
            className="profile-section-card"
          >
            <div className="profile-info-grid">
              <div className="info-item">
                <span className="info-label">Degree / Program</span>
                <span className="info-value">{profile.degree || "—"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Department</span>
                <span className="info-value">{profile.department || "—"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">
                  {activePersona === "student" ? "Expected Graduation" : "Graduation Year"}
                </span>
                <span className="info-value">
                  {profile.graduationYear ? `Year ${profile.graduationYear}` : "—"}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">Academic Status</span>
                <span className="info-value">
                  {activePersona === "student"
                    ? profile.currentSemester || "Enrolled Undergraduate"
                    : "Graduated Alumnus"}
                </span>
              </div>
              <div className="info-item full-width">
                <span className="info-label">Institution</span>
                <span className="info-value">
                  School of Engineering &amp; Technology (SOET), Pune
                </span>
              </div>
            </div>
          </Card>

          {/* Professional Information */}
          <Card
            title="Professional Experience"
            subtitle="Current position, organization, and career highlights"
            className="profile-section-card"
          >
            <div className="profile-info-grid">
              <div className="info-item">
                <span className="info-label">Current Role / Title</span>
                <span className="info-value">{profile.currentRole || "—"}</span>
              </div>
              <div className="info-item">
                <span className="info-label">Organization / Company</span>
                <span className="info-value">{profile.company || "—"}</span>
              </div>
              <div className="info-item full-width">
                <span className="info-label">Experience Summary</span>
                <p className="info-value experience-summary">
                  {profile.experienceSummary || "No professional experience summary entered."}
                </p>
              </div>
            </div>
          </Card>

          {/* Skills & Technologies */}
          <Card
            title="Skills & Technologies"
            subtitle="Technical proficiencies and core competencies"
            className="profile-section-card"
          >
            {/* Inline Add Skill Form */}
            <form onSubmit={handleAddSkill} className="add-skill-form">
              <div className="skill-input-wrapper">
                <label htmlFor="new-skill-input" className="sr-only">
                  Add a new skill
                </label>
                <input
                  id="new-skill-input"
                  type="text"
                  placeholder="e.g. Docker, TypeScript, Microservices..."
                  value={newSkillText}
                  onChange={(e) => {
                    setNewSkillText(e.target.value);
                    if (skillError) setSkillError("");
                  }}
                  className={`form-input ${skillError ? "has-error" : ""}`}
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  icon={Plus}
                  aria-label="Add skill"
                >
                  Add Skill
                </Button>
              </div>
              {skillError && (
                <span className="form-error" role="alert">
                  {skillError}
                </span>
              )}
            </form>

            {/* Skills Badges */}
            <div className="skills-badge-container">
              {profile.skills && profile.skills.length > 0 ? (
                profile.skills.map((skill) => (
                  <span key={skill} className="skill-pill">
                    <Sparkles size={12} className="skill-sparkle" aria-hidden="true" />
                    <span>{skill}</span>
                    <button
                      type="button"
                      className="skill-remove-btn"
                      onClick={() => handleRemoveSkill(skill)}
                      aria-label={`Remove skill ${skill}`}
                      title={`Remove ${skill}`}
                    >
                      <X size={13} aria-hidden="true" />
                    </button>
                  </span>
                ))
              ) : (
                <p className="no-skills-text">
                  No skills listed yet. Use the field above to add skills.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Right Column: Profile Completion & Socials */}
        <div className="profile-side-column">
          {/* Profile Completion Indicator */}
          <Card
            title="Profile Completion"
            subtitle="Calculated from filled profile fields"
            className="completion-card"
          >
            <div className="completion-stats">
              <div className="completion-percent-wrapper">
                <span className="completion-percentage">{completionData.percentage}%</span>
                <span className="completion-status-text">
                  {completionData.percentage === 100
                    ? "Fully Complete"
                    : `${completionData.completedCount} of ${completionData.totalCount} Sections`}
                </span>
              </div>
              <div
                className="completion-track"
                role="progressbar"
                aria-valuenow={completionData.percentage}
                aria-valuemin="0"
                aria-valuemax="100"
                aria-label="Profile completion progress"
              >
                <div
                  className="completion-bar"
                  style={{ width: `${completionData.percentage}%` }}
                ></div>
              </div>
            </div>

            <div className="completion-breakdown">
              <h4 className="breakdown-heading">Checklist Breakdown</h4>
              <ul className="completion-checklist">
                {completionData.checks.map((item) => (
                  <li
                    key={item.id}
                    className={`checklist-item ${item.isComplete ? "complete" : "incomplete"}`}
                  >
                    {item.isComplete ? (
                      <CheckCircle2
                        size={16}
                        className="check-icon complete-icon"
                        aria-hidden="true"
                      />
                    ) : (
                      <AlertCircle
                        size={16}
                        className="check-icon incomplete-icon"
                        aria-hidden="true"
                      />
                    )}
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="completion-note">
              <small>
                Calculated on the client from current demo state. No backend profile-completion API is called.
              </small>
            </p>
          </Card>

          {/* Social & External Links */}
          <Card
            title="Social & External Links"
            subtitle="Professional profiles and portfolios"
            className="social-links-card"
          >
            <div className="social-links-list">
              {profile.linkedin ? (
                <a
                  href={profile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link-item"
                  aria-label={`${profile.name}'s LinkedIn profile (opens in new tab)`}
                >
                  <div className="social-icon-box linkedin-box">
                    <Globe size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">LinkedIn</span>
                    <span className="social-url">{profile.linkedin.replace(/^https?:\/\//i, "")}</span>
                  </div>
                  <ExternalLink size={14} className="external-arrow" aria-hidden="true" />
                </a>
              ) : (
                <div className="social-link-item disabled">
                  <div className="social-icon-box">
                    <Globe size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">LinkedIn</span>
                    <span className="social-url empty">Not provided</span>
                  </div>
                </div>
              )}

              {profile.github ? (
                <a
                  href={profile.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link-item"
                  aria-label={`${profile.name}'s GitHub profile (opens in new tab)`}
                >
                  <div className="social-icon-box github-box">
                    <Link2 size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">GitHub</span>
                    <span className="social-url">{profile.github.replace(/^https?:\/\//i, "")}</span>
                  </div>
                  <ExternalLink size={14} className="external-arrow" aria-hidden="true" />
                </a>
              ) : (
                <div className="social-link-item disabled">
                  <div className="social-icon-box">
                    <Link2 size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">GitHub</span>
                    <span className="social-url empty">Not provided</span>
                  </div>
                </div>
              )}

              {profile.website ? (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link-item"
                  aria-label={`${profile.name}'s Personal Website (opens in new tab)`}
                >
                  <div className="social-icon-box website-box">
                    <ExternalLink size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">Portfolio / Website</span>
                    <span className="social-url">{profile.website.replace(/^https?:\/\//i, "")}</span>
                  </div>
                  <ExternalLink size={14} className="external-arrow" aria-hidden="true" />
                </a>
              ) : (
                <div className="social-link-item disabled">
                  <div className="social-icon-box">
                    <ExternalLink size={18} aria-hidden="true" />
                  </div>
                  <div className="social-link-info">
                    <span className="social-platform">Portfolio / Website</span>
                    <span className="social-url empty">Not provided</span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && editForm && (
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          title={`Edit Demo Profile (${activePersona === "student" ? "Student" : "Alumni"})`}
          size="lg"
        >
          <form onSubmit={handleSaveProfile} className="edit-profile-form" noValidate>
            <div className="modal-demo-notice">
              <Info size={16} aria-hidden="true" />
              <span>
                Changes are saved to local React state for this browser session only.
                Backend profile endpoints are not available on the server.
              </span>
            </div>

            <h3 className="form-subheading">Basic Information</h3>
            <div className="form-row-2">
              <Input
                label="Full Name"
                name="name"
                value={editForm.name}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, name: e.target.value }))
                }
                error={formErrors.name}
                required
              />
              <Input
                label="Email Address"
                name="email"
                type="email"
                value={editForm.email}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, email: e.target.value }))
                }
                error={formErrors.email}
                required
              />
            </div>

            <div className="form-row-2">
              <Input
                label="Location (City, State, Country)"
                name="location"
                value={editForm.location}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, location: e.target.value }))
                }
                placeholder="e.g. Pune, Maharashtra, India"
              />
              {activePersona === "student" && (
                <Input
                  label="Current Semester"
                  name="currentSemester"
                  value={editForm.currentSemester}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, currentSemester: e.target.value }))
                  }
                  placeholder="e.g. 6th Semester"
                />
              )}
            </div>

            <div className="form-group">
              <label htmlFor="bio-input" className="form-label">
                Bio / Summary
              </label>
              <textarea
                id="bio-input"
                name="bio"
                rows={3}
                className={`form-input ${formErrors.bio ? "has-error" : ""}`}
                value={editForm.bio}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, bio: e.target.value }))
                }
                placeholder="Brief summary of background, technical interests, and goals..."
              />
              {formErrors.bio && (
                <span className="form-error" role="alert">
                  {formErrors.bio}
                </span>
              )}
              <span className="form-helper">
                {editForm.bio ? editForm.bio.length : 0} / 500 characters
              </span>
            </div>

            <h3 className="form-subheading">Academic Information</h3>
            <div className="form-row-2">
              <Input
                label="Degree / Program"
                name="degree"
                value={editForm.degree}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, degree: e.target.value }))
                }
                error={formErrors.degree}
                required
                placeholder="e.g. B.Tech Computer Engineering"
              />
              <Input
                label="Department"
                name="department"
                value={editForm.department}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, department: e.target.value }))
                }
                error={formErrors.department}
                required
                placeholder="e.g. Computer Engineering"
              />
            </div>

            <div className="form-row-2">
              <Input
                label={
                  activePersona === "student"
                    ? "Expected Graduation Year"
                    : "Graduation Year"
                }
                name="graduationYear"
                type="number"
                value={editForm.graduationYear}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, graduationYear: e.target.value }))
                }
                error={formErrors.graduationYear}
                required
                placeholder="e.g. 2025"
              />
            </div>

            <h3 className="form-subheading">Professional Information</h3>
            <div className="form-row-2">
              <Input
                label="Current Role / Title"
                name="currentRole"
                value={editForm.currentRole}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, currentRole: e.target.value }))
                }
                placeholder="e.g. Software Engineer Intern or Cloud Architect"
              />
              <Input
                label="Organization / Company"
                name="company"
                value={editForm.company}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, company: e.target.value }))
                }
                placeholder="e.g. Microsoft or SOET"
              />
            </div>

            <div className="form-group">
              <label htmlFor="experienceSummary-input" className="form-label">
                Experience Summary
              </label>
              <textarea
                id="experienceSummary-input"
                name="experienceSummary"
                rows={2}
                className="form-input"
                value={editForm.experienceSummary}
                onChange={(e) =>
                  setEditForm((prev) => ({
                    ...prev,
                    experienceSummary: e.target.value,
                  }))
                }
                placeholder="Overview of practical work, internships, or industry experience..."
              />
            </div>

            <h3 className="form-subheading">Social Profiles &amp; Links</h3>
            <div className="form-row-2">
              <Input
                label="LinkedIn Profile URL"
                name="linkedin"
                value={editForm.linkedin}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, linkedin: e.target.value }))
                }
                error={formErrors.linkedin}
                placeholder="https://linkedin.com/in/username"
              />
              <Input
                label="GitHub Profile URL"
                name="github"
                value={editForm.github}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, github: e.target.value }))
                }
                error={formErrors.github}
                placeholder="https://github.com/username"
              />
            </div>

            <div className="form-row-2">
              <Input
                label="Personal Website / Portfolio URL"
                name="website"
                value={editForm.website}
                onChange={(e) =>
                  setEditForm((prev) => ({ ...prev, website: e.target.value }))
                }
                error={formErrors.website}
                placeholder="https://myportfolio.dev"
              />
            </div>

            <div className="modal-actions-footer">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Changes (Demo Mode)
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default Profile;
