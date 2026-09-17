import React from 'react';
import Button from '../ui/Button';
import './CartPanel.css';

const CartPanel = ({
  selectedItems,
  menu,
  orderForm,
  onFormChange,
  onSubmit,
  onRemoveItem,
  currency,
  userRole,
}) => {
  const selectedMenuItems = menu.filter((item) => selectedItems.includes(item.id));
  const total = selectedMenuItems.reduce((sum, item) => sum + Number(item.price || 0), 0);

  return (
    <aside className="cart-panel">
      <div className="cart-panel__header">
        <h3 className="cart-panel__title">
          <span className="cart-panel__icon">🛒</span>
          Current Order
        </h3>
        <span className="cart-panel__count">{selectedItems.length}</span>
      </div>

      <form className="cart-panel__form" onSubmit={onSubmit}>
        <div className="cart-panel__field">
          <label className="cart-panel__label">Customer</label>
          <input
            type="text"
            className="cart-panel__input"
            value={orderForm.customerName}
            onChange={(e) => onFormChange('customerName', e.target.value)}
            placeholder="e.g. Olivia Brown"
            readOnly={userRole === 'Customer'}
          />
        </div>

        <div className="cart-panel__field">
          <label className="cart-panel__label">Type</label>
          <select
            className="cart-panel__input"
            value={orderForm.type}
            onChange={(e) => onFormChange('type', e.target.value)}
          >
            <option value="DINE_IN">Dine-In</option>
            <option value="PICKUP">Pickup</option>
          </select>
        </div>

        <div className="cart-panel__field">
          <label className="cart-panel__label">Notes</label>
          <textarea
            className="cart-panel__input cart-panel__textarea"
            rows={2}
            value={orderForm.note}
            onChange={(e) => onFormChange('note', e.target.value)}
            placeholder="Allergies, table number..."
          />
        </div>

        <div className="cart-panel__items">
          {selectedMenuItems.length === 0 ? (
            <div className="cart-panel__empty">
              <p>Select items from the menu</p>
            </div>
          ) : (
            selectedMenuItems.map((item) => (
              <div key={item.id} className="cart-panel__item">
                <div className="cart-panel__item-info">
                  <span className="cart-panel__item-name">{item.itemName}</span>
                  <span className="cart-panel__item-price">{currency(item.price)}</span>
                </div>
                <button
                  type="button"
                  className="cart-panel__remove"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Remove ${item.itemName}`}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        <div className="cart-panel__total">
          <span>Total</span>
          <span className="cart-panel__total-value">{currency(total)}</span>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          disabled={selectedItems.length === 0 || !orderForm.customerName}
        >
          Submit Order
        </Button>
      </form>
    </aside>
  );
};

export default CartPanel;
