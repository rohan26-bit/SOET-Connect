import { Bell } from "lucide-react";

function Header() {
  return (
    <header className="header">
      <div>
        <p className="header-label">Administration</p>
        <h1>Admin Dashboard</h1>
      </div>

      <div className="header-actions">
        <button className="notification-button">
          <Bell size={20} />
          <span className="notification-dot"></span>
        </button>

        <div className="admin-profile">
          <div className="profile-avatar">A</div>
          <div>
            <strong>Administrator</strong>
            <span>Admin</span>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;