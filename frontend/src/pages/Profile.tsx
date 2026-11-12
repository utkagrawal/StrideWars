import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { api } from '../api/axios';
import { followUser, getFollowers, getFollowing, unfollowUser } from '../api/social';
import { getGlobalLeaderboard, getUserGlobalRank } from '../api/leaderboards';
import { colorForRunner } from '../utils/colors';
import { formatArea } from '../utils/format';
import { Avatar, Icon, PageLoading } from '../components/ui';

interface ProfileUser {
  id: string;
  username: string;
  email?: string;
  displayName?: string | null;
}

export const Profile = () => {
  const { id } = useParams<{ id?: string }>();
  const { user, logout, updateUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const isOwn = !id || id === user?.id;
  const targetId = (isOwn ? user?.id : id)!;

  const [profile, setProfile] = useState<ProfileUser | null>(null);
  const [standing, setStanding] = useState<{ rank: number | null; area: number }>({
    rank: null,
    area: 0,
  });
  const [followers, setFollowers] = useState<{ id: string; username: string }[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const profileReq: Promise<ProfileUser> = isOwn
        ? Promise.resolve(user as ProfileUser)
        : api.get(`/users/${targetId}`).then((r) => r.data.user);

      // Your own rank is a direct Redis lookup; for others we find them on the board.
      const standingReq = isOwn
        ? getUserGlobalRank().then((r) => ({ rank: r.rank, area: r.areaSquareMeters }))
        : getGlobalLeaderboard(100).then(({ entries }) => {
            const e = entries.find((x) => x.userId === targetId);
            return { rank: e?.rank ?? null, area: e?.areaSquareMeters ?? 0 };
          });

      const [p, s, fol, fing] = await Promise.all([
        profileReq,
        standingReq,
        getFollowers(targetId),
        getFollowing(targetId),
      ]);
      if (cancelled) return;
      setProfile(p);
      setDisplayName(p.displayName || '');
      setStanding(s);
      setFollowers(fol.users);
      setFollowingCount(fing.users.length);
    };

    load()
      .catch(() => !cancelled && setProfile(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [targetId, isOwn, user]);

  const amFollowing = followers.some((f) => f.id === user?.id);

  const toggleFollow = async () => {
    try {
      if (amFollowing) {
        await unfollowUser(targetId);
        setFollowers((f) => f.filter((x) => x.id !== user?.id));
      } else {
        await followUser(targetId);
        setFollowers((f) => [...f, { id: user!.id, username: user!.username }]);
      }
    } catch {
      addToast('Could not update follow status', 'error');
    }
  };

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.patch('/users/me', { displayName: displayName.trim() });
      updateUser(data.user); // header, avatar and this page all read from the auth user
      addToast('Display name saved', 'success');
    } catch {
      addToast('Could not update your profile', 'error');
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  if (loading) return <PageLoading />;
  if (!profile) {
    return (
      <div className="page">
        <div className="form-error">Runner not found.</div>
      </div>
    );
  }

  const color = colorForRunner(profile.username, isOwn);

  return (
    <div className="page">
      <div className="page-header" style={{ alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Avatar name={profile.username} color={color} size={64} isYou={isOwn} />
          <div>
            <h1>{profile.displayName || profile.username}</h1>
            <p style={{ marginTop: 0 }}>@{profile.username}</p>
          </div>
        </div>
        {isOwn ? (
          <button className="btn btn-ghost" onClick={handleLogout}>
            <Icon name="logout" /> Log out
          </button>
        ) : (
          <button
            className={`btn ${amFollowing ? 'btn-secondary' : 'btn-primary'}`}
            onClick={toggleFollow}
          >
            {amFollowing ? 'Following' : 'Follow'}
          </button>
        )}
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Rank</div>
          <div className="stat-value">{standing.rank ?? '–'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ground owned</div>
          <div className="stat-value">{formatArea(standing.area)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Followers</div>
          <div className="stat-value">{followers.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Following</div>
          <div className="stat-value">{followingCount}</div>
        </div>
      </div>

      {isOwn && (
        <>
          <h2 className="section-title">Account</h2>
          <form className="card" onSubmit={saveName}>
            <div className="field">
              <label htmlFor="displayName">Display name</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={profile.username}
                maxLength={50}
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <span className="muted" style={{ fontSize: '0.88rem' }}>
                {profile.email}
              </span>
              <button type="submit" className="btn btn-primary btn-sm">
                Save
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
};
