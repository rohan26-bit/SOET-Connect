import {
  Users,
  GraduationCap,
  UserCheck,
  CalendarDays,
  Briefcase,
  Activity,
} from "lucide-react";

import StatCard from "../components/StatCard";

function Dashboard() {
  const statistics = [
    {
      title: "Total Users",
      value: "1,240",
      description: "Registered users",
      icon: Users,
    },
    {
      title: "Verified Alumni",
      value: "420",
      description: "Verified alumni",
      icon: GraduationCap,
    },
    {
      title: "Pending Verification",
      value: "28",
      description: "Awaiting review",
      icon: UserCheck,
    },
    {
      title: "Total Events",
      value: "36",
      description: "Published events",
      icon: CalendarDays,
    },
    {
      title: "Opportunities",
      value: "18",
      description: "Active opportunities",
      icon: Briefcase,
    },
  ];

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <h2>Overview</h2>
          <p>
            Monitor the current activity of the SOET Connect platform.
          </p>
        </div>
      </div>

      <div className="stats-grid">
        {statistics.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-panel">
          <div className="panel-header">
            <div>
              <h3>Recent Activity</h3>
              <p>Latest platform activity</p>
            </div>
            <Activity size={20} />
          </div>

          <div className="activity-list">
            <div className="activity-item">
              <div className="activity-dot"></div>
              <div>
                <strong>New alumni registration</strong>
                <span>Rahul Sharma registered as an alumni.</span>
              </div>
              <small>10 min ago</small>
            </div>

            <div className="activity-item">
              <div className="activity-dot"></div>
              <div>
                <strong>Event created</strong>
                <span>SOET Alumni Networking Meet was created.</span>
              </div>
              <small>35 min ago</small>
            </div>

            <div className="activity-item">
              <div className="activity-dot"></div>
              <div>
                <strong>Alumni verification pending</strong>
                <span>3 new profiles require verification.</span>
              </div>
              <small>1 hr ago</small>
            </div>
          </div>
        </section>

        <section className="dashboard-panel quick-panel">
          <h3>Quick Actions</h3>
          <p>Frequently used admin actions.</p>

          <button className="quick-action">
            <CalendarDays size={19} />
            Create Event
          </button>

          <button className="quick-action">
            <UserCheck size={19} />
            Review Alumni
          </button>

          <button className="quick-action">
            <Briefcase size={19} />
            Manage Opportunities
          </button>
        </section>
      </div>
    </div>
  );
}

export default Dashboard;