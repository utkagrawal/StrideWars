import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/axios';
import { followUser, unfollowUser, getFollowers, getFollowing } from '../api/social';

export const Profile = () => {
  const { id } = useParams<{ id?: string }>();
  const { user, logout } = useAuth();
  
  const isOwnProfile = !id || id === user?.id;
  const targetUserId = id || user?.id;

  const [profileUser, setProfileUser] = useState<any>(null);
  const [displayName, setDisplayName] = useState('');
  const [message, setMessage] = useState('');
  
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (targetUserId) {
      fetchProfileData();
    }
  }, [targetUserId]);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      // 1. Fetch user info
      if (isOwnProfile) {
        setProfileUser(user);
        setDisplayName(user?.displayName || '');
      } else {
        const { data } = await api.get(`/users/${targetUserId}`);
        setProfileUser(data.user);
      }

      // 2. Fetch social stats
      const [followersData, followingData] = await Promise.all([
        getFollowers(targetUserId!),
        getFollowing(targetUserId!)
      ]);
      
      setFollowersCount(followersData.users.length);
      setFollowingCount(followingData.users.length);

      // Check if current user is following this profile
      if (!isOwnProfile && user) {
        const amIFollowing = followersData.users.some((f: any) => f.id === user.id);
        setIsFollowing(amIFollowing);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      await api.patch('/users/me', { displayName });
      setMessage('Profile updated successfully!');
    } catch (err) {
      setMessage('Failed to update profile.');
    }
  };

  const handleFollowToggle = async () => {
    if (!targetUserId) return;
    try {
      if (isFollowing) {
        await unfollowUser(targetUserId);
        setIsFollowing(false);
        setFollowersCount(prev => prev - 1);
      } else {
        await followUser(targetUserId);
        setIsFollowing(true);
        setFollowersCount(prev => prev + 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div>Loading profile...</div>;
  if (!profileUser) return <div>User not found.</div>;

  return (
    <div className="profile-container" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2>{isOwnProfile ? 'Your Profile' : `${profileUser.username}'s Profile`}</h2>
        {!isOwnProfile && (
          <button 
            onClick={handleFollowToggle}
            style={{
              background: isFollowing ? 'transparent' : 'var(--color-brand-primary)',
              border: isFollowing ? '1px solid var(--color-brand-primary)' : 'none',
              padding: '0.5rem 1rem',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              color: 'white'
            }}
          >
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        )}
      </div>
      
      <div style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
        <p><strong>Username:</strong> {profileUser.username}</p>
        {isOwnProfile && <p><strong>Email:</strong> {profileUser.email}</p>}
        {profileUser.displayName && <p><strong>Display Name:</strong> {profileUser.displayName}</p>}
        
        <div style={{ display: 'flex', gap: '2rem', marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--color-bg-elevated)' }}>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{followersCount}</div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Followers</div>
          </div>
          <div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>{followingCount}</div>
            <div style={{ color: 'var(--color-text-secondary)' }}>Following</div>
          </div>
        </div>
        {followersCount === 0 && (
          <p style={{ color: 'var(--color-text-secondary)', marginTop: '1rem', fontSize: '0.9rem' }}>
            No followers yet. Start capturing ground to get noticed!
          </p>
        )}
      </div>

      {isOwnProfile && (
        <>
          <form onSubmit={handleUpdate} className="update-form" style={{ background: 'var(--color-bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '2rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>Edit Profile</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Display Name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Set a public display name"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'white' }}
              />
            </div>
            <button type="submit" style={{ padding: '0.75rem 1.5rem', background: 'var(--color-brand-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: 'white', cursor: 'pointer' }}>
              Update Profile
            </button>
            {message && <p className="status-message" style={{ marginTop: '1rem', color: 'var(--color-brand-primary)' }}>{message}</p>}
          </form>

          <button onClick={logout} style={{ width: '100%', padding: '1rem', background: 'transparent', border: '1px solid #ef4444', color: '#ef4444', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
            Logout
          </button>
        </>
      )}
    </div>
  );
};
