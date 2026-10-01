function Card({
  children,
  title,
  subtitle,
  action,
  className = "",
  ...props
}) {
  const hasHeader = title || subtitle || action;

  return (
    <section className={`ui-card ${className}`.trim()} {...props}>
      {hasHeader && (
        <header className="ui-card-header">
          <div>
            {title && <h3 className="ui-card-title">{title}</h3>}
            {subtitle && <p className="ui-card-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="ui-card-action">{action}</div>}
        </header>
      )}
      <div className="ui-card-body">{children}</div>
    </section>
  );
}

export default Card;
