import React from 'react';
import './Navbar.css';

const Navbar = ({ user, roleLabel, onLogout }) => {
  return (
    <nav className="navbar">
      <div className="navbar__brand">
        <div className="navbar__logo">
          <span className="navbar__logo-icon">✦</span>
        </div>
        <div className="navbar__titles">
          <span className="navbar__eyebrow">Digital Ordering System</span>
          <h1 className="navbar__title">DineFlow HQ</h1>
        </div>
      </div>

      <div className="navbar__right">
        <div className="navbar__user">
          <span className="navbar__status-dot" />
          <span className="navbar__user-name">{user.name}</span>
          <span className="navbar__role-badge">{roleLabel}</span>
        </div>
        <button className="navbar__logout" onClick={onLogout}>
          Sign out
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
