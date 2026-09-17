import React from 'react';
import MenuGrid from '../menu/MenuGrid';
import Button from '../ui/Button';
import './MenuManagement.css';

const MenuManagement = ({ menu, menuForm, setMenuForm, onAddMenuItem, onToggle, currency }) => {
  return (
    <section className="panel-dark">
      <div className="panel-dark__header">
        <span className="panel-dark__icon">🍽️</span>
        <div>
          <h3 className="panel-dark__title">Menu Management</h3>
          <p className="panel-dark__subtitle">Toggle availability and add new dishes</p>
        </div>
      </div>

      <MenuGrid
        items={menu}
        showToggle
        onToggle={onToggle}
        currency={currency}
      />

      <form className="menu-mgmt-form" onSubmit={onAddMenuItem}>
        <h4 className="menu-mgmt-form__title">Add New Item</h4>
        <div className="menu-mgmt-form__row">
          <input
            type="text"
            className="menu-mgmt-form__input"
            placeholder="Dish name"
            value={menuForm.itemName}
            onChange={(e) => setMenuForm((prev) => ({ ...prev, itemName: e.target.value }))}
          />
          <input
            type="text"
            className="menu-mgmt-form__input"
            placeholder="Description"
            value={menuForm.description}
            onChange={(e) => setMenuForm((prev) => ({ ...prev, description: e.target.value }))}
          />
          <input
            type="number"
            min="0"
            step="0.05"
            className="menu-mgmt-form__input menu-mgmt-form__input--price"
            placeholder="Price"
            value={menuForm.price}
            onChange={(e) => setMenuForm((prev) => ({ ...prev, price: e.target.value }))}
          />
          <Button type="submit" variant="primary" size="md">
            Add
          </Button>
        </div>
      </form>
    </section>
  );
};

export default MenuManagement;
