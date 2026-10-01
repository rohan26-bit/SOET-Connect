function StatCard({ title, value, description, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-card-top">
        <div>
          <p>{title}</p>
          <h2>{value}</h2>
        </div>

        <div className="stat-icon">
          <Icon size={22} />
        </div>
      </div>

      <span className="stat-description">{description}</span>
    </div>
  );
}

export default StatCard;