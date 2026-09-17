import React from 'react';
import './KitchenPanel.css';

const KitchenPanel = ({ orders, orderStatuses, onUpdateStatus, statusUpdatingId, orderForm, currency }) => {
  if (orders.length === 0) {
    return (
      <section className="panel-dark">
        <div className="panel-dark__header">
          <span className="panel-dark__icon">👨‍🍳</span>
          <div>
            <h3 className="panel-dark__title">Kitchen Panel</h3>
            <p className="panel-dark__subtitle">Live production queue</p>
          </div>
        </div>
        <div className="kitchen-empty">
          <p>Kitchen is caught up. 🎉</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel-dark">
      <div className="panel-dark__header">
        <span className="panel-dark__icon">👨‍🍳</span>
        <div>
          <h3 className="panel-dark__title">Kitchen Panel</h3>
          <p className="panel-dark__subtitle">Live production queue</p>
        </div>
        <span className="panel-dark__badge">{orders.length} active</span>
      </div>

      <div className="kitchen-list">
        {orders.map((order) => (
          <article key={order.id} className="kitchen-ticket">
            <header className="kitchen-ticket__header">
              <div>
                <span className="kitchen-ticket__id">ORD-{order.id}</span>
                <h4 className="kitchen-ticket__name">
                  {order.customer?.name || orderForm.customerName || 'Guest'}
                </h4>
              </div>
              <span
                className={`kitchen-ticket__type ${
                  order.type === 'DINE_IN' ? 'kitchen-ticket__type--dinein' : 'kitchen-ticket__type--pickup'
                }`}
              >
                {order.type === 'DINE_IN' ? 'Dine-In' : 'Pickup'}
              </span>
            </header>

            <ul className="kitchen-ticket__items">
              {order.items.map((orderItem) => (
                <li key={orderItem.id}>{orderItem.menuItem?.itemName}</li>
              ))}
            </ul>

            {order.note && <p className="kitchen-ticket__note">📝 {order.note}</p>}

            <div className="kitchen-ticket__status">
              <label className="kitchen-ticket__status-label">Status</label>
              <select
                className="kitchen-ticket__select"
                value={order.status}
                onChange={(e) => onUpdateStatus(order.id, e.target.value)}
                disabled={statusUpdatingId === order.id}
              >
                {orderStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
};

export default KitchenPanel;
