import React from 'react';
import './MenuCard.css';

const MenuCard = ({ item, selected, onSelect, disabled, showToggle, onToggle, currency }) => {
  return (
    <article
      className={`menu-card ${selected ? 'menu-card--selected' : ''} ${disabled ? 'menu-card--disabled' : ''}`}
      onClick={!disabled && onSelect ? () => onSelect(item.id) : undefined}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect && !disabled ? 0 : undefined}
      onKeyDown={(e) => {
        if (onSelect && !disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onSelect(item.id);
        }
      }}
    >
      <div className="menu-card__content">
        <div className="menu-card__header">
          <h4 className="menu-card__name">{item.itemName}</h4>
          {selected && <span className="menu-card__check">✓</span>}
        </div>
        <p className="menu-card__desc">{item.description || 'Signature menu item'}</p>
        <div className="menu-card__footer">
          <span className="menu-card__price">{currency(item.price)}</span>
          {showToggle && (
            <button
              className={`menu-card__toggle ${item.available ? 'menu-card__toggle--active' : 'menu-card__toggle--inactive'}`}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(item.id, !item.available);
              }}
            >
              {item.available ? 'In Service' : 'Sold Out'}
            </button>
          )}
          {!showToggle && !item.available && (
            <span className="menu-card__badge-unavailable">Unavailable</span>
          )}
        </div>
      </div>
    </article>
  );
};

export default MenuCard;
