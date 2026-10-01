import { useState, useMemo } from "react";
import {
  Briefcase,
  Search,
  MapPin,
  CalendarDays,
  Clock,
  Building2,
  Filter,
  RotateCcw,
  Info,
  AlertCircle,
  ExternalLink,
  GraduationCap,
  Sparkles,
  X,
} from "lucide-react";

import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import { initialOpportunities } from "../data/mockData";

function Opportunities() {
  // Local demo state — ready to be replaced with backend API fetch when available
  const [opportunities] = useState(initialOpportunities);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);

  // Extract distinct departments for the filter dropdown
  const departments = useMemo(() => {
    const set = new Set(opportunities.map((item) => item.department));
    return Array.from(set).sort();
  }, [opportunities]);

  // Client-side search and filtering
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((item) => {
      // Type filter
      if (selectedType !== "all" && item.type !== selectedType) {
        return false;
      }

      // Department filter
      if (selectedDepartment !== "all" && item.department !== selectedDepartment) {
        return false;
      }

      // Search query across title, company, department, location, description
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const matchesTitle = item.title?.toLowerCase().includes(query);
        const matchesCompany = item.company?.toLowerCase().includes(query);
        const matchesDepartment = item.department?.toLowerCase().includes(query);
        const matchesLocation = item.location?.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);

        if (!matchesTitle && !matchesCompany && !matchesDepartment && !matchesLocation && !matchesDesc) {
          return false;
        }
      }

      return true;
    });
  }, [opportunities, searchQuery, selectedType, selectedDepartment]);

  // Counts for summary pills
  const totalCount = opportunities.length;
  const internshipCount = opportunities.filter((o) => o.type === "Internship").length;
  const fulltimeCount = opportunities.filter((o) => o.type === "Full-Time").length;

  const isFiltered =
    searchQuery.trim() !== "" ||
    selectedType !== "all" ||
    selectedDepartment !== "all";

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedDepartment("all");
  };

  return (
    <div className="opportunities-page">
      {/* Page Header & Intro */}
      <section className="opportunities-header-section" aria-label="Page Overview">
        <div className="opportunities-intro">
          <div className="opportunities-badge">
            <Sparkles size={14} aria-hidden="true" />
            <span>Career & Placements Hub</span>
          </div>
          <h2>Explore Engineering Opportunities</h2>
          <p>
            Discover verified internship listings, graduate trainee programs, and full-time career roles curated for SOET students and alumni.
          </p>
        </div>

        {/* Demo Mode Notice Banner */}
        <div className="demo-notice-pill" role="status">
          <Info size={16} aria-hidden="true" />
          <span>Demo Data Mode — Local opportunity catalog. Backend API integration in progress</span>
        </div>
      </section>

      {/* Metric / Summary Cards */}
      <section className="opportunities-stats-bar" aria-label="Catalog Overview">
        <div className="stat-pill stat-pill-primary">
          <Briefcase size={16} aria-hidden="true" />
          <span><strong>{totalCount}</strong> Total Listings</span>
        </div>
        <div className="stat-pill stat-pill-intern">
          <span className="pill-dot pill-dot-intern" aria-hidden="true"></span>
          <span><strong>{internshipCount}</strong> Internships</span>
        </div>
        <div className="stat-pill stat-pill-fulltime">
          <span className="pill-dot pill-dot-fulltime" aria-hidden="true"></span>
          <span><strong>{fulltimeCount}</strong> Full-Time Roles</span>
        </div>
      </section>

      {/* Search & Filter Controls */}
      <Card
        className="opportunities-controls-card"
        title="Filter & Search Opportunities"
        subtitle="Search locally by role, company, department, or location"
      >
        <div className="opportunities-filter-grid">
          {/* Accessible Search Input */}
          <div className="filter-group search-group">
            <label htmlFor="opportunity-search" className="filter-label">
              Search Opportunities
            </label>
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" aria-hidden="true" />
              <input
                id="opportunity-search"
                type="search"
                className="filter-input search-input"
                placeholder="Search by title, company, department, location..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search opportunities by title, company, department, or location"
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

          {/* Opportunity Type Filter */}
          <div className="filter-group">
            <label htmlFor="opportunity-type-filter" className="filter-label">
              Opportunity Type
            </label>
            <div className="select-wrapper">
              <select
                id="opportunity-type-filter"
                className="filter-select"
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                aria-label="Filter by opportunity type"
              >
                <option value="all">All Types (Internships & Full-Time)</option>
                <option value="Internship">Internship Only</option>
                <option value="Full-Time">Full-Time Only</option>
              </select>
            </div>
          </div>

          {/* Department Filter */}
          <div className="filter-group">
            <label htmlFor="opportunity-dept-filter" className="filter-label">
              Department / Discipline
            </label>
            <div className="select-wrapper">
              <select
                id="opportunity-dept-filter"
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
        </div>

        {/* Active Filters Summary & Reset */}
        <div className="filter-actions-bar">
          <div className="filter-results-count">
            <Filter size={14} aria-hidden="true" />
            <span>
              Showing <strong>{filteredOpportunities.length}</strong> of{" "}
              <strong>{totalCount}</strong> opportunities
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

      {/* Opportunities List / Empty State */}
      <section className="opportunities-listings-section" aria-label="Available Opportunities">
        {filteredOpportunities.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={
              isFiltered
                ? "No matching opportunities found"
                : "No opportunities available"
            }
            description={
              isFiltered
                ? `No listings match your current filters${
                    searchQuery ? ` for "${searchQuery}"` : ""
                  }. Try adjusting your keywords or clearing the department and type filters.`
                : "There are currently no active opportunity listings in the local catalog."
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
          <div className="opportunities-grid">
            {filteredOpportunities.map((job) => (
              <article key={job.id} className="opportunity-card">
                <header className="opportunity-card-header">
                  <div className="opportunity-brand-row">
                    <div className="company-icon-box" aria-hidden="true">
                      <Building2 size={22} />
                    </div>
                    <div className="opportunity-title-wrap">
                      <h3 className="opportunity-title">{job.title}</h3>
                      <p className="opportunity-company">{job.company}</p>
                    </div>
                  </div>

                  <span
                    className={`type-badge ${
                      job.type === "Internship"
                        ? "badge-intern"
                        : "badge-fulltime"
                    }`}
                  >
                    {job.type}
                  </span>
                </header>

                <div className="opportunity-card-body">
                  <div className="opportunity-tag-row">
                    <span className="opportunity-tag">
                      <GraduationCap size={13} aria-hidden="true" />
                      {job.department}
                    </span>
                    <span className="opportunity-tag">
                      <MapPin size={13} aria-hidden="true" />
                      {job.location}
                    </span>
                  </div>

                  {job.description && (
                    <p className="opportunity-desc-preview">
                      {job.description}
                    </p>
                  )}

                  <div className="opportunity-card-meta">
                    {job.deadline && (
                      <span className="meta-deadline">
                        <CalendarDays size={13} aria-hidden="true" />
                        Deadline: <strong>{job.deadline}</strong>
                      </span>
                    )}
                    {job.postedDate && (
                      <span className="meta-posted">
                        <Clock size={13} aria-hidden="true" />
                        Posted {job.postedDate}
                      </span>
                    )}
                  </div>
                </div>

                <footer className="opportunity-card-footer">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedOpportunity(job)}
                    aria-label={`View full details for ${job.title} at ${job.company}`}
                  >
                    View Details
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    icon={ExternalLink}
                    onClick={() => setSelectedOpportunity(job)}
                    aria-label={`Review application details for ${job.title}`}
                  >
                    Apply
                  </Button>
                </footer>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Opportunity Details & Application Notice Modal */}
      <Modal
        isOpen={selectedOpportunity !== null}
        onClose={() => setSelectedOpportunity(null)}
        title="Opportunity Details"
        size="lg"
        footer={
          <div className="opportunity-modal-actions">
            <Button
              variant="secondary"
              onClick={() => setSelectedOpportunity(null)}
            >
              Close
            </Button>
            <Button
              variant="primary"
              disabled
              aria-disabled="true"
              title="Applications will be enabled when the backend application service is available"
            >
              Apply (Awaiting Backend)
            </Button>
          </div>
        }
      >
        {selectedOpportunity && (
          <div className="opportunity-modal-content">
            <header className="opportunity-modal-header">
              <div className="modal-brand-icon" aria-hidden="true">
                <Building2 size={26} />
              </div>
              <div className="modal-brand-info">
                <h3>{selectedOpportunity.title}</h3>
                <p className="modal-company-name">
                  {selectedOpportunity.company}
                </p>
                <div className="modal-badges-row">
                  <span
                    className={`type-badge ${
                      selectedOpportunity.type === "Internship"
                        ? "badge-intern"
                        : "badge-fulltime"
                    }`}
                  >
                    {selectedOpportunity.type}
                  </span>
                  <span className="badge-tag">
                    {selectedOpportunity.department}
                  </span>
                </div>
              </div>
            </header>

            {/* Key Metadata Grid */}
            <div className="modal-details-grid">
              <div className="detail-field">
                <span className="detail-label">
                  <MapPin size={14} aria-hidden="true" /> Location
                </span>
                <strong className="detail-value">
                  {selectedOpportunity.location}
                </strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <Briefcase size={14} aria-hidden="true" /> Employment Type
                </span>
                <strong className="detail-value">
                  {selectedOpportunity.type}
                </strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <GraduationCap size={14} aria-hidden="true" /> Department
                </span>
                <strong className="detail-value">
                  {selectedOpportunity.department}
                </strong>
              </div>

              <div className="detail-field">
                <span className="detail-label">
                  <CalendarDays size={14} aria-hidden="true" /> Application Deadline
                </span>
                <strong className="detail-value highlight-deadline">
                  {selectedOpportunity.deadline || "Open until filled"}
                </strong>
              </div>
            </div>

            {/* Description Section */}
            <div className="modal-description-section">
              <h4>Role Description & Overview</h4>
              <p className="modal-description-text">
                {selectedOpportunity.description}
              </p>
            </div>

            {/* Backend Application Callout — Explains Application Limitation Honestly */}
            <div className="backend-readiness-callout" role="note">
              <AlertCircle size={20} className="callout-icon" aria-hidden="true" />
              <div className="callout-body">
                <strong>Application Service Notice (Demo Mode):</strong>
                <p>
                  Direct online applications, resume submissions, and applicant tracking endpoints are currently in development by the backend engineering team.
                </p>
                <p className="callout-subtext">
                  Applications will be enabled once the backend application service is deployed. No application request was sent and no status was fabricated.
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Opportunities;
