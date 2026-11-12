import React from 'react';
import { Link } from 'react-router-dom';

/** Small inline icon set (no icon library needed). */
type IconName = 'bell' | 'play' | 'pen' | 'bolt' | 'flag' | 'undo' | 'x' | 'logout' | 'trophy';

const ICON_PATHS: Record<IconName, React.ReactNode> = {
  bell: (
    <>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </>
  ),
  play: <path d="M7 4v16l13-8z" />,
  pen: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  flag: (
    <>
      <path d="M4 22V4" />
      <path d="M4 4h12l-2 4 2 4H4" />
    </>
  ),
  undo: <path d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  trophy: (
    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  ),
};

export const Icon = ({ name, size = 18 }: { name: IconName; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {ICON_PATHS[name]}
  </svg>
);

/** The StrideWars mark: a lime loop on black. */
export const BrandMark = () => (
  <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="6" fill="#141414" />
    <path
      d="M9 20c-2.5-6 2-12 8-11.5 6 .5 8.5 6.5 6 11s-9 6-12.5 2.5"
      fill="none"
      stroke="#a3d900"
      strokeWidth="3"
      strokeLinecap="round"
    />
  </svg>
);

/** Initials avatar tinted with the runner's map colour. */
export const Avatar = ({
  name,
  color,
  size = 36,
  isYou = false,
}: {
  name: string;
  color: string;
  size?: number;
  isYou?: boolean;
}) => (
  <span
    className={`avatar${isYou ? ' you' : ''}`}
    style={{ width: size, height: size, background: color, fontSize: size * 0.5 }}
    aria-hidden="true"
  >
    {name.slice(0, 1)}
  </span>
);

export const Spinner = () => <div className="spinner" role="status" aria-label="Loading" />;

export const PageLoading = () => (
  <div className="center-fill">
    <Spinner />
  </div>
);

export const EmptyState = ({
  title,
  children,
  actionTo,
  actionLabel,
}: {
  title: string;
  children?: React.ReactNode;
  actionTo?: string;
  actionLabel?: string;
}) => (
  <div className="empty">
    <h3>{title}</h3>
    {children && <p>{children}</p>}
    {actionTo && actionLabel && (
      <Link to={actionTo} className="btn btn-primary">
        {actionLabel}
      </Link>
    )}
  </div>
);
