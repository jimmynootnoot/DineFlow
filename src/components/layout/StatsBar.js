import React from 'react';
import './StatsBar.css';

const StatCard = ({ label, value, sub, icon }) => (
  <article className="stat-card">
    <div className="stat-card__icon">{icon}</div>
    <div className="stat-card__content">
      <p className="stat-card__label">{label}</p>
      <h2 className="stat-card__value">{value}</h2>
      <small className="stat-card__sub">{sub}</small>
    </div>
  </article>
);

const StatsBar = ({ menuCount, availableCount, queueCount, completedCount, revenue }) => {
  return (
    <section className="stats-bar">
      <StatCard
        icon="📋"
        label="Menu Items"
        value={menuCount}
        sub={`${availableCount} available today`}
      />
      <StatCard
        icon="🔥"
        label="Active Orders"
        value={queueCount}
        sub="Kitchen queue"
      />
      <StatCard
        icon="✓"
        label="Completed"
        value={completedCount}
        sub="Today"
      />
      <StatCard
        icon="💰"
        label="Sales"
        value={revenue}
        sub="Tracked from completed orders"
      />
    </section>
  );
};

export default StatsBar;
