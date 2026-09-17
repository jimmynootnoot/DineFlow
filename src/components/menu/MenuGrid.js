import React from 'react';
import MenuCard from './MenuCard';
import './MenuGrid.css';

const MenuGrid = ({
  items,
  selectedIds = [],
  onSelect,
  showToggle = false,
  onToggle,
  currency,
}) => {
  return (
    <div className="menu-grid">
      {items.map((item) => (
        <MenuCard
          key={item.id}
          item={item}
          selected={selectedIds.includes(item.id)}
          onSelect={onSelect}
          disabled={!item.available && !showToggle}
          showToggle={showToggle}
          onToggle={onToggle}
          currency={currency}
        />
      ))}
      {items.length === 0 && (
        <p className="menu-grid__empty">No menu items available.</p>
      )}
    </div>
  );
};

export default MenuGrid;
