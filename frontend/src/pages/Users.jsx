import { useState, useMemo } from "react";
import {
  Users,
  GraduationCap,
  Briefcase,
  MapPin,
  CalendarDays,
  CheckCircle2,
  Sparkles,
  Search,
  Filter,
  RotateCcw,
  Info,
  AlertCircle,
  ExternalLink,
  Globe,
  Link2,
  X,
  Building2,
} from "lucide-react";

import { initialAlumni } from "../data/mockData";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";

// Helper to compute initials from full name
function getInitials(name = "") {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function UsersPage() {
  const [alumni] = useState(initialAlumni);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedYear, setSelectedYear] = useState("all");
  const [mentorsOnly, setMentorsOnly] = useState(false);
  const [selectedAlumni, setSelectedAlumni] = useState(null);

  // Distinct departments
  const departments = useMemo(() => {
    const set = new Set(alumni.map((a) => a.department).filter(Boolean));
    return Array.from(set).sort();
  }, [alumni]);

  // Distinct graduation years in descending order
  const graduationYears = useMemo(() => {
    const set = new Set(alumni.map((a) => a.graduationYear).filter(Boolean));
    return Array.from(set).sort((a, b) => b - a);
  }, [alumni]);

  // Filtered alumni records
  const filteredAlumni = useMemo(() => {
    return alumni.filter((person) => {
      // Mentors only filter
      if (mentorsOnly && !person.availableForMentoring) {
        return false;
      }

      // Department filter
      if (selectedDepartment !== "all" && person.department !== selectedDepartment) {
        return false;
      }

      // Graduation year filter
      if (selectedYear !== "all" && String(person.graduationYear) !== selectedYear) {
        return false;
      }

      // Search query across name, company, role, department, skills, location, bio
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase().trim();
        const matchName = person.name?.toLowerCase().includes(q);
        const matchCompany = person.company?.toLowerCase().includes(q);
        const matchRole = person.role?.toLowerCase().includes(q);
        const matchDept = person.department?.toLowerCase().includes(q);
        const matchLoc = person.location?.toLowerCase().includes(q);
        const matchBio = person.bio?.toLowerCase().includes(q);
        const matchSkills = person.skills?.some((s) => s.toLowerCase().includes(q));

        if (!matchName && !matchCompany && !matchRole && !matchDept && !matchLoc && !matchBio && !matchSkills) {
          return false;
        }
      }

      return true;
    });
  }, [alumni, searchQuery, selectedDepartment, selectedYear, mentorsOnly]);

  // Summary counts
  const totalCount = alumni.length;
  const verifiedCount = alumni.filter((a) => a.isVerified).length;
  const mentorsCount = alumni.filter((a) => a.availableForMentoring).length;

  const isFiltered =
    searchQuery.trim() !== "" ||
    selectedDepartment !== "all" ||
    selectedYear !== "all" ||
    mentorsOnly;

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("all");
    setSelectedYear("all");
    setMentorsOnly(false);
  };

  return (
    <div className="alumni-directory-page">
      {/* Page Header & Intro Section */}
      <section className="alumni-header-section" aria-label="Alumni Directory Overview">
        <div className="alumni-intro">
          <div className="alumni-badge">
            <Sparkles size={14} aria-hidden="true" />
            <span>SOET Alumni Network</span>
          </div>
          <h2>Explore the Alumni Directory</h2>
          <p>
            Connect with graduates from the School of Engineering & Technology. Discover career paths, explore industry domains, and find alumni mentors.
          </p>
        </div>

        {/* Demo Mode Notice Banner */}
        <div className="demo-notice-pill" role="status">
          <Info size={16} aria-hidden="true" />
          <span>Demo Data Mode — Local directory preview. Backend alumni endpoints in progress</span>
        </div>
      </section>

      {/* Catalog Metric Overview Pills */}
      <section className="alumni-stats-bar" aria-label="Directory Overview">
        <div className="stat-pill stat-pill-primary">
          <Users size={16} aria-hidden="true" />
          <span><strong>{totalCount}</strong> Demo Profiles</span>
        </div>
        <div className="stat-pill stat-pill-intern">
          <CheckCircle2 size={15} aria-hidden="true" />
          <span><strong>{verifiedCount}</strong> Demo Verified</span>
        </div>
        <div className="stat-pill stat-pill-fulltime">
          <Sparkles size={15} aria-hidden="true" />
          <span><strong>{mentorsCount}</strong> Mentors Available</span>
        </div>
      </section>

      {/* Search & Filter Controls */}
      <Card
        className="alumni-controls-card"
        title="Search & Filter Alumni"
        subtitle="Search locally by name, company, role, department, or technical skill"
      >
        <div className="alumni-filter-grid">
          {/* Accessible Search Input */}
          <div className="filter-group search-group">
            <label htmlFor="alumni-search" className="filter-label">
              Search Alumni
            </label>
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                id="alumni-search"
                type="search"
                className="filter-input search-input"
                placeholder="Search by name, company, role, department, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search alumni by name, company, role, department, or skill"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search input"
                >
                  <X size={15} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Department Filter */}
          <div className="filter-group">
            <label htmlFor="alumni-dept-filter" className="filter-label">
              Department / Discipline
            </label>
            <div className="select-wrapper">
              <select
                id="alumni-dept-filter"
                className="filter-select"
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                aria-label="Filter by engineering department"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Graduation Year Filter */}
          <div className="filter-group">
            <label htmlFor="alumni-year-filter" className="filter-label">
              Graduation Year
            </label>
            <div className="select-wrapper">
              <select
                id="alumni-year-filter"
                className="filter-select"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                aria-label="Filter by graduation year"
              >
                <option value="all">All Batches</option>
                {graduationYears.map((yr) => (
                  <option key={yr} value={String(yr)}>
                    Class of {yr}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mentors Toggle Filter */}
          <div className="filter-group checkbox-filter-group">
            <label className="checkbox-container">
              <input
                type="checkbox"
                checked={mentorsOnly}
                onChange={(e) => setMentorsOnly(e.target.checked)}
                className="filter-checkbox"
                aria-label="Show mentors available for guidance only"
              />
              <span className="checkbox-label">Available for Mentoring</span>
            </label>
          </div>
        </div>

        {/* Active Filters Summary & Reset */}
        <div className="filter-actions-bar">
          <div className="filter-results-count">
            <Filter size={14} aria-hidden="true" />
            <span>
              Showing <strong>{filteredAlumni.length}</strong> of{" "}
              <strong>{totalCount}</strong> alumni
            </span>
            {isFiltered && <span className="filtered-indicator">(Filtered)</span>}
          </div>

          {isFiltered && (
            <Button
              variant="outline"
              size="sm"
              icon={RotateCcw}
              onClick={handleResetFilters}
              aria-label="Reset all search queries and filters"
              className="reset-filters-btn"
            >
              Reset Filters
            </Button>
          )}
        </div>
      </Card>

      {/* Alumni Grid / Empty State */}
      <section className="alumni-grid-section" aria-label="Alumni Members">
        {filteredAlumni.length === 0 ? (
          <EmptyState
            icon={Users}
            title={
              isFiltered
                ? "No matching alumni found"
                : "No alumni profiles in catalog"
            }
            description={
              isFiltered
                ? `No alumni match your current search and filter selections${
                    searchQuery ? ` for "${searchQuery}"` : ""
                  }. Try adjusting your keywords or clearing the department and year filters.`
                : "There are currently no alumni profiles loaded in the demo dataset."
            }
            action={
              isFiltered ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={RotateCcw}
                  onClick={handleResetFilters}
                >
                  Clear All Filters
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="alumni-grid">
            {filteredAlumni.map((person) => {
              const initials = getInitials(person.name);

              return (
                <article key={person.id} className="alumni-card">
                  <header className="alumni-card-header">
                    <div className="alumni-avatar-box" aria-hidden="true">
                      <span>{initials}</span>
                    </div>

                    <div className="alumni-header-info">
                      <div className="alumni-name-row">
                        <h3 className="alumni-name">{person.name}</h3>
                        {person.isVerified && (
                          <span
                            className="demo-verified-chip"
                            title="Demo status: Simulated verification tag"
                          >
                            <CheckCircle2 size={12} aria-hidden="true" />
                            Demo Verified
                          </span>
                        )}
                      </div>

                      <p className="alumni-role-company">
                        {person.role} • <strong>{person.company}</strong>
                      </p>

                      <div className="alumni-badges-row">
                        <span className="alumni-badge-pill">
                          <CalendarDays size={11} aria-hidden="true" />
                          Class of {person.graduationYear}
                        </span>
                        {person.availableForMentoring && (
                          <span className="alumni-mentor-chip">
                            <Sparkles size={11} aria-hidden="true" />
                            Mentoring
                          </span>
                        )}
                      </div>
                    </div>
                  </header>

                  <div className="alumni-card-body">
                    <div className="alumni-meta-tags">
                      <span className="alumni-meta-tag">
                        <GraduationCap size={12} aria-hidden="true" />
                        {person.department}
                      </span>
                      <span className="alumni-meta-tag">
                        <MapPin size={12} aria-hidden="true" />
                        {person.location}
                      </span>
                    </div>

                    {person.bio && (
                      <p className="alumni-bio-preview">{person.bio}</p>
                    )}

                    {person.skills && person.skills.length > 0 && (
                      <div className="alumni-skills-preview">
                        {person.skills.slice(0, 3).map((skill) => (
                          <span key={skill} className="skill-chip">
                            {skill}
                          </span>
                        ))}
                        {person.skills.length > 3 && (
                          <span className="skill-chip-more">
                            +{person.skills.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <footer className="alumni-card-footer">
                    <div className="alumni-social-links">
                      {person.linkedin && (
                        <a
                          href={person.linkedin}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="social-link"
                          aria-label={`${person.name}'s demo LinkedIn profile (opens in new tab)`}
                          title="LinkedIn (Demo URL)"
                        >
                          <Link2 size={15} aria-hidden="true" />
                          <span>LinkedIn</span>
                        </a>
                      )}

                      {person.github && (
                        <a
                          href={person.github}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="social-link"
                          aria-label={`${person.name}'s demo GitHub profile (opens in new tab)`}
                          title="GitHub (Demo URL)"
                        >
                          <ExternalLink size={14} aria-hidden="true" />
                          <span>GitHub</span>
                        </a>
                      )}

                      {person.website && (
                        <a
                          href={person.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="social-link"
                          aria-label={`${person.name}'s demo personal website (opens in new tab)`}
                          title="Website (Demo URL)"
                        >
                          <Globe size={14} aria-hidden="true" />
                          <span>Web</span>
                        </a>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedAlumni(person)}
                      aria-label={`View full profile for ${person.name}`}
                    >
                      View Profile
                    </Button>
                  </footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Alumni Profile Preview Modal */}
      <Modal
        isOpen={selectedAlumni !== null}
        onClose={() => setSelectedAlumni(null)}
        title="Alumni Profile Preview"
        size="lg"
        footer={
          <div className="alumni-modal-actions">
            <Button
              variant="secondary"
              onClick={() => setSelectedAlumni(null)}
            >
              Close
            </Button>
          </div>
        }
      >
        {selectedAlumni && (
          <div className="alumni-modal-content">
            <header className="alumni-modal-header">
              <div className="alumni-modal-avatar" aria-hidden="true">
                {getInitials(selectedAlumni.name)}
              </div>

              <div className="alumni-modal-title-cluster">
                <div className="alumni-name-row">
                  <h3>{selectedAlumni.name}</h3>
                  {selectedAlumni.isVerified && (
                    <span className="demo-verified-chip" title="Simulated verification">
                      <CheckCircle2 size={13} aria-hidden="true" />
                      Demo Verified
                    </span>
                  )}
                </div>

                <p className="alumni-modal-role">
                  {selectedAlumni.role} at <strong>{selectedAlumni.company}</strong>
                </p>

                <div className="alumni-modal-badges">
                  <span className="alumni-badge-pill">
                    <CalendarDays size={12} aria-hidden="true" />
                    Class of {selectedAlumni.graduationYear}
                  </span>
                  {selectedAlumni.availableForMentoring && (
                    <span className="alumni-mentor-chip">
                      <Sparkles size={12} aria-hidden="true" />
                      Available for Mentoring
                    </span>
                  )}
                </div>
              </div>
            </header>

            {/* Key Information Grid */}
            <div className="alumni-details-grid">
              <div className="detail-field">
                <span className="detail-label">
                  <GraduationCap size={14} aria-hidden="true" /> Department
                </span>
                <strong className="detail-value">{selectedAlumni.department}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <Building2 size={14} aria-hidden="true" /> Degree & Program
                </span>
                <strong className="detail-value">{selectedAlumni.degree}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <MapPin size={14} aria-hidden="true" /> Location
                </span>
                <strong className="detail-value">{selectedAlumni.location}</strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <Briefcase size={14} aria-hidden="true" /> Current Company
                </span>
                <strong className="detail-value">{selectedAlumni.company}</strong>
              </div>
            </div>

            {/* Biography */}
            <div className="alumni-modal-section">
              <h4>Professional Summary & Background</h4>
              <p className="alumni-modal-bio-text">{selectedAlumni.bio}</p>
            </div>

            {/* Core Skills & Expertise */}
            {selectedAlumni.skills && selectedAlumni.skills.length > 0 && (
              <div className="alumni-modal-section">
                <h4>Technical Skills & Core Competencies</h4>
                <div className="alumni-modal-skills">
                  {selectedAlumni.skills.map((skill) => (
                    <span key={skill} className="skill-chip skill-chip-lg">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social Links Row */}
            {(selectedAlumni.linkedin || selectedAlumni.github || selectedAlumni.website) && (
              <div className="alumni-modal-section">
                <h4>Professional & Project Links (Demo)</h4>
                <div className="alumni-modal-links-row">
                  {selectedAlumni.linkedin && (
                    <a
                      href={selectedAlumni.linkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-link-btn"
                    >
                      <Link2 size={15} aria-hidden="true" />
                      <span>LinkedIn Profile</span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}

                  {selectedAlumni.github && (
                    <a
                      href={selectedAlumni.github}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-link-btn"
                    >
                      <ExternalLink size={15} aria-hidden="true" />
                      <span>GitHub Projects</span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}

                  {selectedAlumni.website && (
                    <a
                      href={selectedAlumni.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="social-link-btn"
                    >
                      <Globe size={15} aria-hidden="true" />
                      <span>Personal Portfolio</span>
                      <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Honest Backend Limitation Callout */}
            <div className="backend-readiness-callout" role="note">
              <AlertCircle size={20} className="callout-icon" aria-hidden="true" />
              <div className="callout-body">
                <strong>Alumni Directory Notice (Demo Mode):</strong>
                <p>
                  Direct alumni messaging, appointment scheduling, and verified identity badges are currently in development by the backend engineering team.
                </p>
                <p className="callout-subtext">
                  Profile records shown here are simulated local demo data. No backend requests were made and no live contact details were accessed.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default UsersPage;
