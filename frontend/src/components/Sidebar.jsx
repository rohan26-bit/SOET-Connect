import {
  LayoutDashboard,
  CalendarDays,
  Users,
  UserCheck,
  Briefcase,
} from "lucide-react";

function Sidebar({ activePage, setActivePage }) {
  const menuItems = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      page: "dashboard",
    },
    {
      name: "Events",
      icon: CalendarDays,
      page: "events",
    },
    {
      name: "Users",
      icon: Users,
      page: "users",
    },
    {
      name: "Verification",
      icon: UserCheck,
      page: "verification",
    },
    {
      name: "Opportunities",
      icon: Briefcase,
      page: "opportunities",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-mark">S</div>
        <div>
          <h2>SOET Connect</h2>
          <span>Admin Panel</span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.page}
              className={`nav-item ${
                activePage === item.page ? "active" : ""
              }`}
              onClick={() => setActivePage(item.page)}
            >
              <Icon size={19} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <span>SOET Connect</span>
        <small>Admin Portal</small>
      </div>
    </aside>
  );
}

export default Sidebar;