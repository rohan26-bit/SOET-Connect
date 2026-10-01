import { useState, useRef, useEffect } from "react";
import { useLocation, Link, useNavigate } from "react-router-dom";
import {
  Bell,
  CalendarDays,
  Briefcase,
  Users,
  Megaphone,
  Sparkles,
  Info,
  CheckCheck,
  ArrowRight,
} from "lucide-react";
import { useNotifications } from "../context/useNotifications";

const routeMeta = {
  "/": { title: "Student Dashboard", label: "Portal & Campus Overview" },
  "/dashboard": { title: "Student Dashboard", label: "Portal & Campus Overview" },
  "/events": { title: "Events Management", label: "Programs & Activities" },
  "/users": { title: "Alumni Directory", label: "Community & Network" },
  "/verification": { title: "Alumni Verification", label: "Approval Queue" },
  "/opportunities": { title: "Opportunities Hub", label: "Career & Placements" },
  "/profile": { title: "User Profile", label: "Account & Portfolio" },
  "/notifications": { title: "Notifications & Alerts", label: "Account Activity" },
  "/announcements": { title: "Campus Announcements", label: "Notices & Bulletins" },
  "/settings": { title: "Portal Settings", label: "Preferences & Session" },
};

function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { notifications, unreadCount, markAsRead, markAllAsRead } =
    useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(location.pathname);
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname);
    setIsOpen(false);
  }

  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);

  const currentMeta = routeMeta[location.pathname] || {
    title: "SOET Connect",
    label: "Portal",
  };

  // Close dropdown on outside click or Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleNotificationClick = (item) => {
    markAsRead(item.id);
    if (item.link) {
      setIsOpen(false);
      navigate(item.link);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case "event":
        return <CalendarDays size={16} aria-hidden="true" />;
      case "opportunity":
        return <Briefcase size={16} aria-hidden="true" />;
      case "alumni":
        return <Users size={16} aria-hidden="true" />;
      case "announcement":
        return <Megaphone size={16} aria-hidden="true" />;
      case "system":
      default:
        return <Sparkles size={16} aria-hidden="true" />;
    }
  };

  return (
    <header className="header">
      <div>
        <p className="header-label">{currentMeta.label}</p>
        <h1>{currentMeta.title}</h1>
      </div>

      <div className="header-actions">
        {/* Accessible Notification Bell & Dropdown */}
        <div className="notification-wrapper" ref={dropdownRef}>
          <button
            ref={buttonRef}
            type="button"
            className={`notification-button ${isOpen ? "active" : ""}`}
            aria-label={`Notifications${
              unreadCount > 0 ? `, ${unreadCount} unread` : ""
            }`}
            aria-expanded={isOpen}
            aria-haspopup="dialog"
            title="Notifications"
            onClick={() => setIsOpen((prev) => !prev)}
          >
            <Bell size={20} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="notification-badge" aria-hidden="true">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : (
              <span
                className="notification-dot inactive"
                aria-hidden="true"
              ></span>
            )}
          </button>

          {/* Dropdown Panel */}
          {isOpen && (
            <div
              className="notification-dropdown"
              role="dialog"
              aria-label="Recent notifications"
            >
              <div className="dropdown-header">
                <div className="dropdown-title-group">
                  <h3>Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="dropdown-unread-pill">
                      {unreadCount} unread
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    className="dropdown-mark-all"
                    onClick={markAllAsRead}
                    aria-label="Mark all notifications as read"
                  >
                    <CheckCheck size={14} aria-hidden="true" />
                    <span>Mark all read</span>
                  </button>
                )}
              </div>

              {/* Demo Notice Banner */}
              <div className="dropdown-demo-notice">
                <Info size={13} aria-hidden="true" />
                <span>Demo mode: Read state is stored in this session only.</span>
              </div>

              <div className="dropdown-list">
                {notifications.length === 0 ? (
                  <div className="dropdown-empty">
                    <Bell size={24} className="dropdown-empty-icon" aria-hidden="true" />
                    <p>No notifications yet</p>
                  </div>
                ) : (
                  notifications.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className={`dropdown-item ${!item.isRead ? "unread" : ""}`}
                      onClick={() => handleNotificationClick(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNotificationClick(item);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`${item.title}, ${item.timestamp}${
                        !item.isRead ? ", unread" : ""
                      }`}
                    >
                      <div className={`dropdown-icon-box type-${item.type}`}>
                        {getNotificationIcon(item.type)}
                      </div>
                      <div className="dropdown-item-content">
                        <div className="dropdown-item-header">
                          <span className="dropdown-item-title">
                            {item.title}
                          </span>
                          {!item.isRead && (
                            <span
                              className="unread-indicator-dot"
                              aria-hidden="true"
                            ></span>
                          )}
                        </div>
                        <p className="dropdown-item-message">{item.message}</p>
                        <span className="dropdown-item-time">
                          {item.timestamp}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="dropdown-footer">
                <Link
                  to="/notifications"
                  className="dropdown-view-all"
                  onClick={() => setIsOpen(false)}
                >
                  <span>View all notifications</span>
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Profile Avatar Box */}
        <Link
          to="/profile"
          className="admin-profile"
          aria-label="View user profile"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="profile-avatar" aria-hidden="true">
            U
          </div>
          <div>
            <strong>Member Profile</strong>
            <span>Student / Alumni</span>
          </div>
        </Link>
      </div>
    </header>
  );
}

export default Header;