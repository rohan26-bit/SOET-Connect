import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  Briefcase,
  Users,
  Megaphone,
  Sparkles,
  CheckCheck,
  Check,
  RotateCcw,
  Trash2,
  ExternalLink,
  Info,
  Filter,
} from "lucide-react";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import Toast from "../components/ui/Toast";
import { useNotifications } from "../context/useNotifications";

function Notifications() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAsUnread,
    markAllAsRead,
    deleteNotification,
    resetNotifications,
  } = useNotifications();

  // Filters state
  const [statusFilter, setStatusFilter] = useState("all"); // "all" | "unread" | "read"
  const [categoryFilter, setCategoryFilter] = useState("all"); // "all" | "opportunity" | "event" | "alumni" | "announcement" | "system"

  // Toast notification state
  const [toastMessage, setToastMessage] = useState(null);

  const showToast = (msg) => {
    setToastMessage(msg);
  };

  // Filtered notifications
  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "unread" && !item.isRead) ||
        (statusFilter === "read" && item.isRead);

      const matchesCategory =
        categoryFilter === "all" || item.type === categoryFilter;

      return matchesStatus && matchesCategory;
    });
  }, [notifications, statusFilter, categoryFilter]);

  const readCount = notifications.length - unreadCount;

  const getCategoryIcon = (type) => {
    switch (type) {
      case "event":
        return <CalendarDays size={18} aria-hidden="true" />;
      case "opportunity":
        return <Briefcase size={18} aria-hidden="true" />;
      case "alumni":
        return <Users size={18} aria-hidden="true" />;
      case "announcement":
        return <Megaphone size={18} aria-hidden="true" />;
      case "system":
      default:
        return <Sparkles size={18} aria-hidden="true" />;
    }
  };

  const getCategoryLabel = (type) => {
    switch (type) {
      case "event":
        return "Event";
      case "opportunity":
        return "Career";
      case "alumni":
        return "Alumni & Mentorship";
      case "announcement":
        return "Announcement";
      case "system":
      default:
        return "System";
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead();
    showToast("All notifications marked as read in session state.");
  };

  const handleReset = () => {
    resetNotifications();
    setStatusFilter("all");
    setCategoryFilter("all");
    showToast("Reset notifications back to default demo feed.");
  };

  const handleToggleRead = (id, currentStatus) => {
    if (currentStatus) {
      markAsUnread(id);
      showToast("Notification marked as unread.");
    } else {
      markAsRead(id);
      showToast("Notification marked as read.");
    }
  };

  const handleDelete = (id) => {
    deleteNotification(id);
    showToast("Notification dismissed.");
  };

  return (
    <div className="notifications-page">
      {/* Toast notifications */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          type="info"
          onClose={() => setToastMessage(null)}
          duration={3500}
        />
      )}

      {/* Demo Notice Banner */}
      <div className="profile-demo-banner" role="status" aria-label="Demo notice">
        <div className="demo-banner-content">
          <Info size={18} className="demo-banner-icon" aria-hidden="true" />
          <div>
            <strong>Demo Notification Feed:</strong> Operating in local demonstration mode.
            Backend notification endpoints (<code>/notifications</code>) are pending deployment.
            Read/unread statuses and actions are stored in your current browser session only.
          </div>
        </div>

        <div className="persona-toggle-group">
          <Button
            variant="outline"
            size="sm"
            icon={RotateCcw}
            onClick={handleReset}
            title="Reset to default mock notifications"
            aria-label="Reset demo notifications"
          >
            Reset Feed
          </Button>
        </div>
      </div>

      {/* Page Header & Global Actions Bar */}
      <div className="notifications-header-card">
        <div className="notifications-header-main">
          <div className="notif-header-title-group">
            <div className="notif-bell-avatar" aria-hidden="true">
              <Bell size={24} />
            </div>
            <div>
              <h2>Activity &amp; Notifications</h2>
              <p className="notif-header-sub">
                Track career opportunities, campus event alerts, and mentorship updates.
              </p>
            </div>
          </div>

          <div className="notifications-header-actions">
            <Button
              variant="primary"
              size="sm"
              icon={CheckCheck}
              onClick={handleMarkAllRead}
              disabled={unreadCount === 0}
              aria-label="Mark all notifications as read"
            >
              Mark All Read ({unreadCount})
            </Button>
          </div>
        </div>

        {/* Status and Category Filter Controls */}
        <div className="notifications-filter-bar">
          <div className="filter-tab-group" role="tablist" aria-label="Filter by read status">
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "all"}
              className={`filter-tab-btn ${statusFilter === "all" ? "active" : ""}`}
              onClick={() => setStatusFilter("all")}
            >
              <span>All</span>
              <span className="filter-count-chip">{notifications.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "unread"}
              className={`filter-tab-btn ${statusFilter === "unread" ? "active" : ""}`}
              onClick={() => setStatusFilter("unread")}
            >
              <span>Unread</span>
              <span className="filter-count-chip unread-chip">{unreadCount}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={statusFilter === "read"}
              className={`filter-tab-btn ${statusFilter === "read" ? "active" : ""}`}
              onClick={() => setStatusFilter("read")}
            >
              <span>Read</span>
              <span className="filter-count-chip">{readCount}</span>
            </button>
          </div>

          <div className="filter-category-select-wrapper">
            <Filter size={14} className="filter-select-icon" aria-hidden="true" />
            <label htmlFor="category-select" className="sr-only">
              Filter by category
            </label>
            <select
              id="category-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="filter-category-select"
            >
              <option value="all">All Categories</option>
              <option value="opportunity">Career &amp; Placements</option>
              <option value="event">Events</option>
              <option value="alumni">Alumni &amp; Mentorship</option>
              <option value="announcement">Announcements</option>
              <option value="system">System Updates</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List Section */}
      <section className="notifications-list-container" aria-label="Notifications list">
        {filteredNotifications.length === 0 ? (
          <Card className="notif-empty-card">
            <EmptyState
              icon={Bell}
              title={
                statusFilter === "unread"
                  ? "You're all caught up!"
                  : "No notifications found"
              }
              description={
                statusFilter === "unread"
                  ? "There are no unread notifications in your feed right now."
                  : "No notifications match your current filter criteria."
              }
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatusFilter("all");
                    setCategoryFilter("all");
                  }}
                >
                  View All Notifications
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="notifications-cards-stack">
            {filteredNotifications.map((notif) => (
              <article
                key={notif.id}
                className={`notif-card ${!notif.isRead ? "unread" : ""}`}
              >
                <div className={`notif-icon-box type-${notif.type}`}>
                  {getCategoryIcon(notif.type)}
                </div>

                <div className="notif-card-body">
                  <div className="notif-meta-row">
                    <div className="notif-type-cluster">
                      <span className={`notif-type-tag tag-${notif.type}`}>
                        {getCategoryLabel(notif.type)}
                      </span>
                      {!notif.isRead && (
                        <span className="notif-unread-tag">New</span>
                      )}
                    </div>
                    <time className="notif-timestamp">{notif.timestamp}</time>
                  </div>

                  <h3 className="notif-card-title">{notif.title}</h3>
                  <p className="notif-card-message">{notif.message}</p>

                  <div className="notif-actions-row">
                    <div className="notif-primary-actions">
                      {notif.link && (
                        <Link
                          to={notif.link}
                          className="btn btn-outline btn-sm notif-action-btn"
                          aria-label={`Open linked resource for ${notif.title}`}
                          onClick={() => markAsRead(notif.id)}
                        >
                          <span>Open Resource</span>
                          <ExternalLink size={13} aria-hidden="true" />
                        </Link>
                      )}
                      <button
                        type="button"
                        className="notif-text-btn"
                        onClick={() => handleToggleRead(notif.id, notif.isRead)}
                        aria-label={`Mark "${notif.title}" as ${
                          notif.isRead ? "unread" : "read"
                        }`}
                      >
                        <Check size={13} aria-hidden="true" />
                        <span>{notif.isRead ? "Mark Unread" : "Mark as Read"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="notif-dismiss-btn"
                      onClick={() => handleDelete(notif.id)}
                      title="Dismiss notification"
                      aria-label={`Dismiss notification: ${notif.title}`}
                    >
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default Notifications;
