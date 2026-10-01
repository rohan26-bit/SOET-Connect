import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Megaphone,
  Calendar,
  Building2,
  ArrowRight,
  Info,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { initialAnnouncements } from "../data/mockData";

function Announcements() {
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Filter announcements by category
  const filteredAnnouncements = useMemo(() => {
    if (selectedCategory === "all") return initialAnnouncements;
    return initialAnnouncements.filter(
      (item) => item.category.toLowerCase() === selectedCategory.toLowerCase()
    );
  }, [selectedCategory]);

  // Unique categories for filters
  const categories = useMemo(() => {
    const set = new Set(initialAnnouncements.map((item) => item.category));
    return ["all", ...Array.from(set)];
  }, []);

  // Category counts for stats
  const stats = useMemo(() => {
    const total = initialAnnouncements.length;
    const placement = initialAnnouncements.filter(
      (a) => a.category === "Placement"
    ).length;
    const mentorship = initialAnnouncements.filter(
      (a) => a.category === "Mentorship"
    ).length;
    const academic = initialAnnouncements.filter(
      (a) => a.category === "Academic" || a.category === "Events"
    ).length;

    return { total, placement, mentorship, academic };
  }, []);

  const getCategoryClass = (cat) => {
    switch (cat.toLowerCase()) {
      case "placement":
        return "cat-placement";
      case "mentorship":
        return "cat-mentorship";
      case "academic":
        return "cat-academic";
      case "events":
        return "cat-events";
      case "campus":
      default:
        return "cat-campus";
    }
  };

  return (
    <div className="announcements-page">
      {/* Demo Notice Banner */}
      <div className="profile-demo-banner" role="status" aria-label="Demo notice">
        <div className="demo-banner-content">
          <Info size={18} className="demo-banner-icon" aria-hidden="true" />
          <div>
            <strong>Demo Announcements:</strong> Operating in local demonstration mode.
            Official department bulletins and notices are loaded from catalog mock data.
            Backend announcement publishing endpoints are pending deployment.
          </div>
        </div>
      </div>

      {/* Header Card & Quick Stats */}
      <div className="announcements-hero-card">
        <div className="announcements-hero-title-group">
          <div className="announcements-hero-icon" aria-hidden="true">
            <Megaphone size={28} />
          </div>
          <div>
            <h2>Campus &amp; Placement Announcements</h2>
            <p className="announcements-hero-sub">
              Official circulars from the SOET Placement Cell, department chairs, and alumni council.
            </p>
          </div>
        </div>

        {/* Quick Stats Pill Row */}
        <div className="announcements-stats-grid" aria-label="Announcement summary metrics">
          <div className="announcements-stat-box">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Notices</span>
          </div>
          <div className="announcements-stat-box">
            <span className="stat-number">{stats.placement}</span>
            <span className="stat-label">Placement Drives</span>
          </div>
          <div className="announcements-stat-box">
            <span className="stat-number">{stats.mentorship}</span>
            <span className="stat-label">Mentorship Cohorts</span>
          </div>
          <div className="announcements-stat-box">
            <span className="stat-number">{stats.academic}</span>
            <span className="stat-label">Academic &amp; Events</span>
          </div>
        </div>
      </div>

      {/* Category Filter Bar */}
      <div className="announcements-filter-bar">
        <div className="filter-tab-group" role="tablist" aria-label="Filter announcements by category">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={selectedCategory === cat}
              className={`filter-tab-btn ${selectedCategory === cat ? "active" : ""}`}
              onClick={() => setSelectedCategory(cat)}
            >
              <span style={{ textTransform: "capitalize" }}>
                {cat === "all" ? "All Notices" : cat}
              </span>
              <span className="filter-count-chip">
                {cat === "all"
                  ? initialAnnouncements.length
                  : initialAnnouncements.filter(
                      (item) => item.category.toLowerCase() === cat.toLowerCase()
                    ).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Announcements Catalog List */}
      <section className="announcements-grid-section" aria-label="Announcements list">
        {filteredAnnouncements.length === 0 ? (
          <Card className="announcements-empty-card">
            <EmptyState
              icon={Megaphone}
              title="No announcements in this category"
              description="Check back soon or switch categories to view other departmental bulletins."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedCategory("all")}
                >
                  View All Announcements
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="announcements-card-list">
            {filteredAnnouncements.map((item) => (
              <article key={item.id} className="announcement-full-card">
                <div className="announcement-card-header-row">
                  <div className="announcement-badges-left">
                    <span
                      className={`announcement-category-pill ${getCategoryClass(
                        item.category
                      )}`}
                    >
                      {item.category}
                    </span>
                    {item.author && (
                      <span className="announcement-author-tag">
                        <Building2 size={12} aria-hidden="true" />
                        <span>{item.author}</span>
                      </span>
                    )}
                  </div>

                  <time className="announcement-date-tag">
                    <Calendar size={13} aria-hidden="true" />
                    <span>{item.date}</span>
                  </time>
                </div>

                <h3 className="announcement-title">{item.title}</h3>
                <p className="announcement-body-text">{item.content}</p>

                {item.link && (
                  <div className="announcement-footer-row">
                    <Link
                      to={item.link}
                      className="btn btn-outline btn-sm announcement-action-btn"
                      aria-label={`${item.linkText || "View related page"} for ${
                        item.title
                      }`}
                    >
                      <span>{item.linkText || "View Details"}</span>
                      <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Announcements;
