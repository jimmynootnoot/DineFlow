import React from 'react';
import './SalesSummary.css';

const SalesSummary = ({ salesSummary, currency }) => {
  const stats = [
    { label: 'Total Orders', value: salesSummary.totalOrders, icon: '📦' },
    { label: 'Completed', value: salesSummary.completedOrders, icon: '✅' },
    { label: 'Revenue', value: currency(salesSummary.totalRevenue), icon: '💎' },
    { label: 'Dine-In', value: salesSummary.dineIn, icon: '🍽️' },
    { label: 'Pickup', value: salesSummary.pickup, icon: '📱' },
  ];

  return (
    <section className="panel-dark">
      <div className="panel-dark__header">
        <span className="panel-dark__icon">💰</span>
        <div>
          <h3 className="panel-dark__title">Sales Summary</h3>
          <p className="panel-dark__subtitle">Snapshot of completed revenue</p>
        </div>
      </div>

      <div className="sales-grid">
        {stats.map((stat) => (
          <article key={stat.label} className="sales-card">
            <span className="sales-card__icon">{stat.icon}</span>
            <p className="sales-card__label">{stat.label}</p>
            <h2 className="sales-card__value">{stat.value}</h2>
          </article>
        ))}
      </div>
    </section>
  );
};

export default SalesSummary;
