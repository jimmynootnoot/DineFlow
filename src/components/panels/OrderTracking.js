import React from 'react';
import './OrderTracking.css';

const OrderTracking = ({ orders, filterStatus, onFilterChange, orderStatuses }) => {
  return (
    <section className="panel-dark">
      <div className="panel-dark__header">
        <span className="panel-dark__icon">📊</span>
        <div>
          <h3 className="panel-dark__title">Order Tracking</h3>
          <p className="panel-dark__subtitle">Monitor every ticket</p>
        </div>
      </div>

      <div className="tracking-filter">
        <label className="tracking-filter__label">Filter by status</label>
        <select
          className="tracking-filter__select"
          value={filterStatus}
          onChange={(e) => onFilterChange(e.target.value)}
        >
          <option value="All">All Orders</option>
          {orderStatuses.map((status) => (
            <option key={status} value={status}>
              {status.replace('_', ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="tracking-timeline">
        {orders.length === 0 ? (
          <div className="tracking-empty">
            <p>No orders in this state.</p>
          </div>
        ) : (
          orders.map((order) => (
            <article key={order.id} className="tracking-item">
              <div className="tracking-item__info">
                <h4 className="tracking-item__name">
                  {order.customer?.name || 'Guest'}
                </h4>
                <span className="tracking-item__id">ORD-{order.id}</span>
                <p className="tracking-item__meta">
                  {order.items.length} items • {order.status.replace('_', ' ')}
                </p>
              </div>
              <div className="tracking-item__right">
                <span className={`tracking-item__status tracking-item__status--${order.status.toLowerCase()}`}>
                  {order.status.replace('_', ' ')}
                </span>
                <time className="tracking-item__time">
                  {new Date(order.createdAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
};

export default OrderTracking;
