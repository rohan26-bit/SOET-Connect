import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Sliders,
  ShieldCheck,
  Lock,
  ExternalLink,
  Info,
  RotateCcw,
  CheckCircle2,
  Clock,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Toast from "../components/ui/Toast";
import { demoStudentProfile } from "../data/mockData";

const defaultNotificationPrefs = {
  events: true,
  opportunities: true,
  alumni: true,
  announcements: true,
  system: true,
};

const defaultDisplayPrefs = {
  reducedMotion: false,
  compactDensity: false,
  highContrastFocus: false,
};

function Settings() {
  // Local React session state for preferences
  const [notificationPrefs, setNotificationPrefs] = useState(
    defaultNotificationPrefs
  );
  const [displayPrefs, setDisplayPrefs] = useState(defaultDisplayPrefs);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState(null);
  const [toastType, setToastType] = useState("info");

  const showToast = (message, type = "info") => {
    setToastMessage(message);
    setToastType(type);
  };

  // Synchronize display preferences directly to documentElement
  useEffect(() => {
    const root = document.documentElement;

    if (displayPrefs.reducedMotion) {
      root.classList.add("reduce-motion");
    } else {
      root.classList.remove("reduce-motion");
    }

    if (displayPrefs.compactDensity) {
      root.classList.add("density-compact");
    } else {
      root.classList.remove("density-compact");
    }

    if (displayPrefs.highContrastFocus) {
      root.classList.add("high-contrast-focus");
    } else {
      root.classList.remove("high-contrast-focus");
    }

    return () => {
      root.classList.remove(
        "reduce-motion",
        "density-compact",
        "high-contrast-focus"
      );
    };
  }, [displayPrefs]);

  const handleToggleNotif = (key) => {
    setNotificationPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      showToast(
        `Notification preference for "${key}" updated for this session.`
      );
      return updated;
    });
  };

  const handleToggleDisplay = (key) => {
    setDisplayPrefs((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      showToast(`Display preference updated.`);
      return updated;
    });
  };

  const handleResetSettings = () => {
    setNotificationPrefs(defaultNotificationPrefs);
    setDisplayPrefs(defaultDisplayPrefs);
    showToast("Demo settings reset to default values.", "success");
  };

  return (
    <div className="settings-page">
      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type={toastType}
          onClose={() => setToastMessage(null)}
          duration={3500}
        />
      )}

      {/* Demo Notice Banner */}
      <div className="profile-demo-banner" role="status" aria-label="Demo notice">
        <div className="demo-banner-content">
          <Info size={18} className="demo-banner-icon" aria-hidden="true" />
          <div>
            <strong>Demo Portal Settings:</strong> Operating in local demonstration mode.
            Preferences and configuration options are saved in your current browser session only.
            Backend settings and account management endpoints are pending deployment.
          </div>
        </div>

        <div className="persona-toggle-group">
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={handleResetSettings}
            title="Reset preferences to default mock settings"
            aria-label="Reset demo settings"
          >
            Reset Settings
          </Button>
        </div>
      </div>

      {/* Page Header */}
      <div className="settings-hero-card">
        <div className="settings-hero-main">
          <div className="settings-hero-icon" aria-hidden="true">
            <Sliders size={26} />
          </div>
          <div>
            <h2>Portal &amp; Account Settings</h2>
            <p className="settings-hero-sub">
              Manage notification channels, interface density, and inspect active session diagnostics.
            </p>
          </div>
        </div>
      </div>

      {/* Grid of Settings Sections */}
      <div className="settings-grid">
        {/* Section A: Account & Profile Overview */}
        <Card
          title="Account & Profile Summary"
          subtitle="Current active demo persona and credentials"
          action={
            <Link
              to="/profile"
              className="btn btn-outline btn-sm settings-action-link"
              aria-label="Manage full profile details"
            >
              <span>Manage Profile</span>
              <ExternalLink size={13} aria-hidden="true" />
            </Link>
          }
          className="settings-card"
        >
          <div className="settings-account-summary">
            <div className="settings-avatar-cluster">
              <div className="settings-avatar-box" aria-hidden="true">
                AS
              </div>
              <div className="settings-user-info">
                <div className="settings-name-row">
                  <strong>{demoStudentProfile.name}</strong>
                  <span className="profile-role-badge badge-student">
                    {demoStudentProfile.roleType === "student"
                      ? "Student Member"
                      : "Alumni"}
                  </span>
                </div>
                <span className="settings-email-text">{demoStudentProfile.email}</span>
                <span className="settings-meta-sub">
                  {demoStudentProfile.degree} &bull; {demoStudentProfile.department}
                </span>
              </div>
            </div>

            <div className="settings-profile-status-bar">
              <div className="settings-status-badge">
                <ShieldCheck size={14} className="badge-icon-verified" aria-hidden="true" />
                <span>Verified SOET Community Member</span>
              </div>
              <div className="settings-completion-chip">
                <span>Profile 100% Complete</span>
              </div>
            </div>

            <div className="settings-security-callout">
              <Lock size={15} className="security-callout-icon" aria-hidden="true" />
              <div className="security-callout-text">
                <strong>Account Security Notice:</strong> Password changes, two-factor authentication, and email verification require real backend authentication services, which are currently pending backend implementation.
              </div>
            </div>
          </div>
        </Card>

        {/* Section B: Notification Preferences */}
        <Card
          title="Notification Preferences"
          subtitle="Configure alert categories delivered to your session feed and bell dropdown"
          className="settings-card"
        >
          <div className="settings-toggles-list" role="group" aria-label="Notification channels">
            <label htmlFor="pref-events" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Event &amp; Webinar Alerts</span>
                <span className="setting-toggle-desc">
                  Reminders for upcoming tech summits, guest lectures, and student workshops.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-events"
                  checked={notificationPrefs.events}
                  onChange={() => handleToggleNotif("events")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-opps" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Career &amp; Opportunity Alerts</span>
                <span className="setting-toggle-desc">
                  Notifications when new internships, placement drives, and jobs are published.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-opps"
                  checked={notificationPrefs.opportunities}
                  onChange={() => handleToggleNotif("opportunities")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-alumni" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Alumni &amp; Mentorship Updates</span>
                <span className="setting-toggle-desc">
                  Alerts when alumni mentors update availability or accept connection requests.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-alumni"
                  checked={notificationPrefs.alumni}
                  onChange={() => handleToggleNotif("alumni")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-announcements" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Campus &amp; Placement Announcements</span>
                <span className="setting-toggle-desc">
                  Official circulars, exam schedule updates, and placement cell bulletins.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-announcements"
                  checked={notificationPrefs.announcements}
                  onChange={() => handleToggleNotif("announcements")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-system" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">System &amp; Profile Alerts</span>
                <span className="setting-toggle-desc">
                  Reminders regarding profile completion, portal maintenance, and feature releases.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-system"
                  checked={notificationPrefs.system}
                  onChange={() => handleToggleNotif("system")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>
          </div>

          <div className="settings-sub-note">
            <small>
              Demo preference &mdash; applies only to this frontend session. No server notification workers are configured.
            </small>
          </div>
        </Card>

        {/* Section C: Interface & Accessibility Preferences */}
        <Card
          title="Display &amp; Accessibility"
          subtitle="Customize interface density, motion, and visual focus on this device"
          className="settings-card"
        >
          <div className="settings-toggles-list" role="group" aria-label="Display preferences">
            <label htmlFor="pref-motion" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Reduced Motion</span>
                <span className="setting-toggle-desc">
                  Minimizes transitions, sliding animations, and hover transforms across the portal.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-motion"
                  checked={displayPrefs.reducedMotion}
                  onChange={() => handleToggleDisplay("reducedMotion")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-density" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Compact Layout Density</span>
                <span className="setting-toggle-desc">
                  Reduces card padding and list gaps to display more records simultaneously.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-density"
                  checked={displayPrefs.compactDensity}
                  onChange={() => handleToggleDisplay("compactDensity")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>

            <label htmlFor="pref-contrast" className="setting-toggle-item">
              <div className="setting-toggle-info">
                <span className="setting-toggle-title">Enhanced Focus Outlines</span>
                <span className="setting-toggle-desc">
                  Renders high-visibility focus borders for improved keyboard navigation accessibility.
                </span>
              </div>
              <div className="switch-wrapper">
                <input
                  type="checkbox"
                  id="pref-contrast"
                  checked={displayPrefs.highContrastFocus}
                  onChange={() => handleToggleDisplay("highContrastFocus")}
                  className="switch-input"
                />
                <span className="switch-slider" aria-hidden="true"></span>
              </div>
            </label>
          </div>
        </Card>

        {/* Section D: Demo Environment & Session Diagnostics */}
        <Card
          title="Session &amp; Architecture Diagnostics"
          subtitle="Inspection of active frontend boundaries and backend contract status"
          className="settings-card"
        >
          <div className="diagnostics-table-wrap">
            <table className="diagnostics-table" aria-label="Backend contract status">
              <thead>
                <tr>
                  <th scope="col">Feature / Endpoint</th>
                  <th scope="col">Backend Route</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>User Registration</td>
                  <td><code>POST /auth/register</code></td>
                  <td>
                    <span className="diag-badge diag-active">
                      <CheckCircle2 size={12} aria-hidden="true" /> Live API
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>User Login &amp; JWT</td>
                  <td><code>POST /auth/login</code></td>
                  <td>
                    <span className="diag-badge diag-pending">
                      <Clock size={12} aria-hidden="true" /> Pending Backend
                    </span>
                  </td>
                </tr>
                <tr>
                  <td>Profile Management</td>
                  <td><code>GET /profile</code> &bull; <code>PUT /profile</code></td>
                  <td>
                    <span className="diag-badge diag-mock">Local Mock Active</span>
                  </td>
                </tr>
                <tr>
                  <td>Notifications Feed</td>
                  <td><code>GET /notifications</code></td>
                  <td>
                    <span className="diag-badge diag-mock">Session State Active</span>
                  </td>
                </tr>
                <tr>
                  <td>Campus Announcements</td>
                  <td><code>GET /announcements</code></td>
                  <td>
                    <span className="diag-badge diag-mock">Local Catalog Active</span>
                  </td>
                </tr>
                <tr>
                  <td>User Preferences</td>
                  <td><code>PUT /settings/preferences</code></td>
                  <td>
                    <span className="diag-badge diag-mock">Session State Active</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="diagnostics-footer">
            <span className="diag-note">
              <strong>Persistence Boundary:</strong> Changes are stored in local React memory only. Zero data is sent to nonexistent settings endpoints.
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default Settings;
