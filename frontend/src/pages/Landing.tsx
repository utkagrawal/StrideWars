import React from 'react';
import { Link } from 'react-router-dom';

export const Landing = () => {
  return (
    <div style={{
      minHeight: 'calc(100vh - 70px)',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      textAlign: 'center',
      padding: '2rem',
      background: 'linear-gradient(180deg, var(--color-bg-base) 0%, rgba(74, 222, 128, 0.05) 100%)'
    }}>
      <div style={{ maxWidth: '800px', width: '100%' }}>
        <h1 style={{ 
          fontSize: '4rem', 
          marginBottom: '1rem',
          background: 'linear-gradient(90deg, #fff, #4ade80)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          lineHeight: 1.1
        }}>
          The Map is a Shared World.
        </h1>
        
        <p style={{ 
          fontSize: '1.5rem', 
          color: 'var(--color-text-secondary)', 
          marginBottom: '3rem',
          lineHeight: 1.5
        }}>
          Ground is claimed by running real loops. Defend your turf or take it from others. Every run has stakes.
        </p>

        <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center' }}>
          <Link to="/register" style={{
            background: 'var(--color-brand-primary)',
            color: '#000',
            padding: '1rem 2.5rem',
            borderRadius: 'var(--radius-full)',
            textDecoration: 'none',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 14px rgba(74, 222, 128, 0.4)',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease'
          }}>
            Join the War
          </Link>
          <Link to="/login" style={{
            background: 'transparent',
            color: 'white',
            border: '2px solid rgba(255, 255, 255, 0.2)',
            padding: '1rem 2.5rem',
            borderRadius: 'var(--radius-full)',
            textDecoration: 'none',
            fontSize: '1.25rem',
            fontWeight: 'bold',
            transition: 'border-color 0.2s ease'
          }}>
            Log In
          </Link>
        </div>

        <div style={{ 
          marginTop: '5rem', 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', 
          gap: '2rem',
          textAlign: 'left'
        }}>
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ color: '#4ade80', marginBottom: '1rem', fontSize: '1.5rem' }}>1. Run a Loop</h3>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Use your phone's GPS to record a run. Your path must close into a polygon to be valid.
            </p>
          </div>
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ color: '#4ade80', marginBottom: '1rem', fontSize: '1.5rem' }}>2. Claim Ground</h3>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Every geographic cell enclosed by your path becomes your territory.
            </p>
          </div>
          <div style={{ background: 'var(--color-bg-surface)', padding: '2rem', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ color: '#ef4444', marginBottom: '1rem', fontSize: '1.5rem' }}>3. Take Turf</h3>
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              If your run overlaps another player's ground, you steal it from them. Last capture wins.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
