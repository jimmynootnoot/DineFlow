import React from 'react';
import Button from '../ui/Button';
import './CheckoutModal.css';

const CheckoutModal = ({ open, onClose, children, title, subtitle }) => {
  if (!open) return null;

  return (
    <div className="checkout-overlay" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="checkout-modal" onClick={(e) => e.stopPropagation()}>
        <header className="checkout-modal__header">
          <div>
            <h2 className="checkout-modal__title">{title}</h2>
            {subtitle && <p className="checkout-modal__subtitle">{subtitle}</p>}
          </div>
          <button className="checkout-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="checkout-modal__body">{children}</div>
        <footer className="checkout-modal__footer">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled>
            Submit request
          </Button>
        </footer>
      </div>
    </div>
  );
};

export default CheckoutModal;
