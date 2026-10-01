import { Inbox } from "lucide-react";

function EmptyState({
  icon: Icon = Inbox,
  title = "No data found",
  description = "There are no items to display at this time.",
  action = null,
  className = "",
}) {
  return (
    <div className={`ui-empty-state ${className}`.trim()}>
      <div className="empty-state-icon" aria-hidden="true">
        <Icon size={44} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}

export default EmptyState;
