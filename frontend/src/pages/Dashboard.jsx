import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  Briefcase,
  GraduationCap,
  Bell,
  ArrowRight,
  Clock,
  MapPin,
  Sparkles,
  ExternalLink,
  UserCheck,
  CheckCircle2,
  Info,
  Building2,
} from "lucide-react";

import StatCard from "../components/StatCard";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import EmptyState from "../components/ui/EmptyState";
import {
  initialEvents,
  initialOpportunities,
  initialAnnouncements,
  featuredAlumniMentors,
} from "../data/mockData";
import authService from "../services/auth";

// Parse date parts safely with local timezone alignment
function parseDateParts(dateString) {
  if (!dateString) return { day: "20", month: "SEP" };
  const d = new Date(dateString + "T00:00:00");
  const day = d.getDate() || "20";
  const month =
    d.toLocaleString("default", { month: "short" }).toUpperCase() || "SEP";
  return { day, month };
}

function Dashboard() {
  const [selectedMentor, setSelectedMentor] = useState(null);
  const storedUser = authService.getUser();
  const userName = storedUser?.name || "Student";

  const statistics = [
    {
      title: "Upcoming Events",
      value: String(initialEvents.length),
      description: "Workshops, meets & talks",
      icon: CalendarDays,
    },
    {
      title: "Opportunities",
      value: String(initialOpportunities.length),
      description: "Internships & graduate roles",
      icon: Briefcase,
    },
    {
      title: "Alumni Network",
      value: "420+",
      description: "Verified industry graduates",
      icon: GraduationCap,
    },
    {
      title: "Announcements",
      value: String(initialAnnouncements.length),
      description: "Active placement & campus alerts",
      icon: Bell,
    },
  ];

  return (
    <div className="dashboard-page">
      {/* Welcome & Status Banner */}
      <section className="dashboard-welcome-banner" aria-label="Welcome Overview">
        <div className="welcome-text">
          <div className="welcome-badge">
            <Sparkles size={14} aria-hidden="true" />
            <span>Student Portal Overview</span>
          </div>
          <h2>Welcome back, {userName}!</h2>
          <p>
            Stay updated with SOET campus events, browse curated career opportunities, and connect with engineering alumni mentors.
          </p>
        </div>

        <div className="demo-notice-pill" role="status">
          <Info size={16} aria-hidden="true" />
          <span>Demo Data Mode — Backend dashboard endpoints in progress</span>
        </div>
      </section>

      {/* Metrics Grid */}
      <section className="stats-grid" aria-label="Key Platform Metrics">
        {statistics.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      {/* Main Content Grid */}
      <div className="dashboard-grid">
        {/* Left Column (2fr): Events, Opportunities, Announcements */}
        <div className="dashboard-main-col">
          {/* Upcoming Events Section */}
          <Card
            title="Upcoming Events & Workshops"
            subtitle="Campus and alumni sessions scheduled for this month"
            action={
              <Link to="/events" className="panel-action-link">
                <span>View All Events</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            }
            className="dashboard-section-card"
          >
            {initialEvents.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No upcoming events"
                description="Check back soon for new webinars and campus gatherings."
              />
            ) : (
              <div className="dashboard-events-list">
                {initialEvents.slice(0, 3).map((event) => {
                  const { day, month } = parseDateParts(event.date);

                  return (
                    <article key={event.id} className="dashboard-event-item">
                      <div className="event-date-badge">
                        <span className="event-day">{day}</span>
                        <span className="event-month">{month}</span>
                      </div>

                    <div className="event-info">
                      <div className="event-title-row">
                        <h4>{event.title}</h4>
                        <span className="badge-tag">{event.eventType}</span>
                      </div>
                      <p className="event-desc">{event.description}</p>
                      <div className="event-meta-row">
                        <span>
                          <Clock size={13} aria-hidden="true" />
                          {event.time}
                        </span>
                        <span>
                          <MapPin size={13} aria-hidden="true" />
                          {event.location}
                        </span>
                      </div>
                    </div>

                    <Link
                      to="/events"
                      className="btn btn-outline btn-sm event-item-btn"
                      aria-label={`View details for ${event.title}`}
                    >
                      Details
                    </Link>
                  </article>
                );
              })}
              </div>
            )}
          </Card>

          {/* Recent Opportunities Section */}
          <Card
            title="Recent Opportunities"
            subtitle="Internships and jobs posted for engineering students"
            action={
              <Link to="/opportunities" className="panel-action-link">
                <span>Browse Hub</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            }
            className="dashboard-section-card"
          >
            {initialOpportunities.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="No active listings"
                description="New internship opportunities will appear here once posted."
              />
            ) : (
              <div className="dashboard-opportunities-list">
                {initialOpportunities.map((job) => (
                  <article key={job.id} className="opportunity-item">
                    <div className="opportunity-icon-box" aria-hidden="true">
                      <Building2 size={20} />
                    </div>

                    <div className="opportunity-details">
                      <div className="opportunity-title-row">
                        <h4>{job.title}</h4>
                        <span
                          className={`type-badge ${
                            job.type === "Internship"
                              ? "badge-intern"
                              : "badge-fulltime"
                          }`}
                        >
                          {job.type}
                        </span>
                      </div>

                      <p className="opportunity-company">{job.company}</p>

                      <div className="opportunity-meta">
                        <span>
                          <MapPin size={13} aria-hidden="true" />
                          {job.location}
                        </span>
                        <span>•</span>
                        <span>{job.department}</span>
                        <span>•</span>
                        <span className="posted-time">Posted {job.postedDate}</span>
                      </div>
                    </div>

                    <Link
                      to="/opportunities"
                      className="btn btn-secondary btn-sm"
                      aria-label={`View details for ${job.title} at ${job.company}`}
                    >
                      <span>View</span>
                      <ExternalLink size={13} aria-hidden="true" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </Card>

          {/* Campus Announcements */}
          <Card
            title="Campus & Placement Notices"
            subtitle="Official notifications from the department and placement cell"
            action={
              <Link to="/announcements" className="panel-action-link">
                <span>View All</span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            }
            className="dashboard-section-card"
          >
            <div className="announcements-list">
              {initialAnnouncements.slice(0, 3).map((item) => (
                <div key={item.id} className="announcement-item">
                  <div className="announcement-top">
                    <span className="announcement-category">{item.category}</span>
                    <span className="announcement-date">{item.date}</span>
                  </div>
                  <h4>{item.title}</h4>
                  <p>{item.content}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right Column (1fr): Profile Summary, Quick Actions, Featured Alumni */}
        <aside className="dashboard-sidebar-col" aria-label="Sidebar Widgets">
          {/* Student Status Summary Card */}
          <Card title="Student Profile Status" className="dashboard-side-card">
            <div className="student-profile-widget">
              <div className="student-avatar-box">
                <span className="student-avatar-initial">
                  {userName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{userName}</strong>
                  <span className="student-role-tag">Student Member</span>
                </div>
              </div>

              <div className="profile-details-list">
                <div className="detail-item">
                  <span className="detail-label">Institution:</span>
                  <span className="detail-val">School of Engineering (SOET)</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Academic Status:</span>
                  <span className="detail-val status-badge">
                    <CheckCircle2 size={12} aria-hidden="true" /> Active
                  </span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Department:</span>
                  <span className="detail-val">Computer Engineering</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Actions Panel — ALL Real Navigation */}
          <Card
            title="Quick Navigation"
            subtitle="Direct shortcuts to key portal modules"
            className="dashboard-side-card"
          >
            <nav className="quick-actions-nav" aria-label="Dashboard quick links">
              <Link to="/events" className="quick-action-item">
                <div className="action-icon-wrap" aria-hidden="true">
                  <CalendarDays size={18} />
                </div>
                <div className="action-label-wrap">
                  <strong>Browse Events</strong>
                  <small>Register for talks & meets</small>
                </div>
                <ArrowRight size={15} className="action-arrow" aria-hidden="true" />
              </Link>

              <Link to="/opportunities" className="quick-action-item">
                <div className="action-icon-wrap" aria-hidden="true">
                  <Briefcase size={18} />
                </div>
                <div className="action-label-wrap">
                  <strong>Explore Opportunities</strong>
                  <small>Internships and open roles</small>
                </div>
                <ArrowRight size={15} className="action-arrow" aria-hidden="true" />
              </Link>

              <Link to="/users" className="quick-action-item">
                <div className="action-icon-wrap" aria-hidden="true">
                  <UserCheck size={18} />
                </div>
                <div className="action-label-wrap">
                  <strong>Alumni Directory</strong>
                  <small>Find graduated peers</small>
                </div>
                <ArrowRight size={15} className="action-arrow" aria-hidden="true" />
              </Link>

              <Link to="/register" className="quick-action-item">
                <div className="action-icon-wrap" aria-hidden="true">
                  <GraduationCap size={18} />
                </div>
                <div className="action-label-wrap">
                  <strong>Create Account</strong>
                  <small>Register as Student or Alumni</small>
                </div>
                <ArrowRight size={15} className="action-arrow" aria-hidden="true" />
              </Link>
            </nav>
          </Card>

          {/* Featured Alumni Mentors */}
          <Card
            title="Alumni Mentors"
            subtitle="Graduates available for guidance (Community Preview)"
            className="dashboard-side-card"
          >
            <div className="mentors-list">
              {featuredAlumniMentors.map((mentor) => (
                <div key={mentor.id} className="mentor-item">
                  <div className="mentor-header">
                    <div>
                      <strong>{mentor.name}</strong>
                      <span className="mentor-batch">{mentor.batch}</span>
                    </div>
                    {mentor.availableForMentoring && (
                      <span className="mentoring-chip">Mentoring</span>
                    )}
                  </div>
                  <p className="mentor-role-company">
                    {mentor.role} • <span>{mentor.company}</span>
                  </p>
                  <p className="mentor-expertise">
                    <strong>Focus:</strong> {mentor.expertise}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mentor-connect-btn"
                    onClick={() => setSelectedMentor(mentor)}
                  >
                    View Connection Info
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </aside>
      </div>

      {/* Connection Info Modal */}
      <Modal
        isOpen={selectedMentor !== null}
        onClose={() => setSelectedMentor(null)}
        title="Alumni Mentor Profile"
        footer={
          <div className="modal-actions">
            <Button
              variant="secondary"
              onClick={() => setSelectedMentor(null)}
            >
              Close
            </Button>
            <Link
              to="/users"
              className="btn btn-primary"
              onClick={() => setSelectedMentor(null)}
            >
              View in Directory
            </Link>
          </div>
        }
      >
        {selectedMentor && (
          <div className="mentor-modal-content">
            <div className="mentor-modal-header">
              <div className="mentor-avatar-lg" aria-hidden="true">
                {selectedMentor.name.charAt(0)}
              </div>
              <div>
                <h3>{selectedMentor.name}</h3>
                <p className="mentor-modal-sub">
                  {selectedMentor.role} at <strong>{selectedMentor.company}</strong>
                </p>
                <span className="mentor-batch">{selectedMentor.batch}</span>
              </div>
            </div>

            <div className="mentor-modal-body">
              <div className="info-block">
                <strong>Area of Expertise:</strong>
                <p>{selectedMentor.expertise}</p>
              </div>

              <div className="backend-readiness-callout" role="note">
                <Info size={16} aria-hidden="true" />
                <span>
                  <strong>Backend Integration Notice:</strong> Direct messaging and appointment booking will connect to the backend mentorship endpoint once released by the backend engineering team.
                </span>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default Dashboard;