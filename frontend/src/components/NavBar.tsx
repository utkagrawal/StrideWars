import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getUnreadCount } from '../api/notifications';
import { Avatar, BrandMark, Icon } from './ui';
import { YOU_COLOR } from '../utils/colors';

const navClass = ({ isActive }: { isActive: boolean }) => `nav-link${isActive ? ' active' : ''}`;

/** Unread "you lost ground" alerts; refreshed on navigation and every 30 s. */
const AlertsBell = () => {
  const [unread, setUnread] = useState(0);
  const location = useLocation();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      getUnreadCount()
        .then(({ count }) => !cancelled && setUnread(count))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [location.pathname]);

  return (
    <Link
      to="/notifications"
      className="icon-btn"
      aria-label={unread ? `${unread} unread alerts` : 'Alerts'}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && <span className="badge-dot">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
};

export const NavBar = () => {
  const { user } = useAuth();

  return (
    <header className="nav">
      <Link to="/" className="brand">
        <BrandMark />
        <span>StrideWars</span>
      </Link>

      {user ? (
        <>
          <nav className="nav-links" aria-label="Main">
            <NavLink to="/" end className={navClass}>
              Map
            </NavLink>
            <NavLink to="/leaderboards" className={navClass}>
              Leaderboard
            </NavLink>
            <NavLink to="/feed" className={navClass}>
              Feed
            </NavLink>
            <NavLink to="/runs" className={navClass}>
              My Runs
            </NavLink>
          </nav>
          <div className="nav-right">
            <AlertsBell />
            <Link to="/profile" aria-label="Your profile" title={user.username}>
              <Avatar name={user.username} color={YOU_COLOR} size={32} isYou />
            </Link>
          </div>
        </>
      ) : (
        <div className="nav-right">
          <Link to="/login" className="btn btn-ghost btn-sm">
            Log in
          </Link>
          <Link to="/register" className="btn btn-primary btn-sm">
            Sign up
          </Link>
        </div>
      )}
    </header>
  );
};
