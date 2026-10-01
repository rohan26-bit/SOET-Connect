import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserCheck,
  Briefcase,
  User,
  Megaphone,
  Bell,
  Settings,
} from "lucide-react";

function Sidebar() {
  const menuItems = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },
    {
      name: "Events",
      icon: CalendarDays,
      path: "/events",
    },
    {
      name: "Users",
      icon: Users,
      path: "/users",
    },
    {
      name: "Verification",
      icon: UserCheck,
      path: "/verification",
    },
    {
      name: "Opportunities",
      icon: Briefcase,
      path: "/opportunities",
    },
    {
      name: "Announcements",
      icon: Megaphone,
      path: "/announcements",
    },
    {
      name: "Notifications",
      icon: Bell,
      path: "/notifications",
    },
    {
      name: "Profile",
      icon: User,
      path: "/profile",
    },
    {
      name: "Settings",
      icon: Settings,
      path: "/settings",
    },
  ];

  return (
    <aside className="sidebar" aria-label="Sidebar Navigation">
      <div className="sidebar-logo">
        <div className="logo-mark" aria-hidden="true">
          S
        </div>
        <div>
          <h2>SOET Connect</h2>
          <span>Student &amp; Alumni Portal</span>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Main Navigation">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
              title={item.name}
            >
              <Icon size={19} aria-hidden="true" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span>SOET Connect</span>
        <small>Campus Network</small>
      </div>
    </aside>
  );
}

export default Sidebar;