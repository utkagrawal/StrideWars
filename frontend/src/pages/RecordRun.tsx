import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { createRun, PointInput, Run } from '../api/runs';
import { useToast } from '../hooks/useToast';

export const RecordRun = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pointsJson, setPointsJson] = useState('');
  const [successData, setSuccessData] = useState<{ run: Run; capturedTerritories: { geohash: string; previousOwnerId: string | null }[] } | null>(null);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleGenerateMock = () => {
    // Generate 10 points mimicking a simple run moving North-East
    const baseLat = 37.7749;
    const baseLng = -122.4194;
    const startTime = new Date();
    
    const mockPoints: PointInput[] = [];
    for (let i = 0; i < 10; i++) {
      mockPoints.push({
        lat: baseLat + i * 0.001,
        lng: baseLng + i * 0.001,
        recordedAt: new Date(startTime.getTime() + i * 10000).toISOString(), // 10 seconds apart
      });
    }
    setPointsJson(JSON.stringify(mockPoints, null, 2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    try {
      let parsedPoints: PointInput[] = [];
      try {
        parsedPoints = JSON.parse(pointsJson);
      } catch (err) {
        setError('Invalid JSON format for points');
        return;
      }

      if (!Array.isArray(parsedPoints) || parsedPoints.length === 0) {
        setError('Points must be a non-empty array');
        return;
      }

      setLoading(true);
      const clientRunId = crypto.randomUUID();
      const startedAt = parsedPoints[0].recordedAt;

      const data = await createRun(clientRunId, startedAt, parsedPoints);
      setSuccessData(data);
      addToast('Run uploaded successfully!', 'success');
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to record run');
      addToast(err.response?.data?.error?.message || 'Failed to record run', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (successData) {
    return (
      <div className="auth-container" style={{ textAlign: 'center' }}>
        <h2 style={{ color: 'var(--color-brand-primary)' }}>Run Uploaded Successfully!</h2>
        
        <div style={{ background: 'var(--color-bg-elevated)', padding: '2rem', borderRadius: 'var(--radius-md)', margin: '2rem 0' }}>
          <h3 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{successData.capturedTerritories.length}</h3>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>Territories Captured</p>
          
          {successData.capturedTerritories.length > 0 && (
            <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '4px' }}>
              {successData.capturedTerritories.map(t => (
                <div key={t.geohash} style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                  Captured <span style={{ fontFamily: 'monospace' }}>{t.geohash}</span>
                  {t.previousOwnerId && <span style={{ color: 'var(--color-error)', marginLeft: '0.5rem' }}>(Stolen!)</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to={`/runs/${successData.run.id}`}>
            <button style={{ background: 'transparent', border: '1px solid var(--color-brand-primary)' }}>View Run Details</button>
          </Link>
          <Link to="/territories">
            <button>View on Map</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <h2>Upload Run</h2>
      <p style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
        For Phase 4, you can upload raw GPS points manually.
      </p>
      
      {error && <div className="error-message">{error}</div>}
      
      <button onClick={handleGenerateMock} type="button" style={{ marginBottom: '1rem', background: 'var(--color-bg-surface)', border: '1px solid var(--color-brand-primary)' }}>
        Auto-Generate Mock Points
      </button>

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="points">GPS Points (JSON Array)</label>
          <textarea
            id="points"
            value={pointsJson}
            onChange={(e) => setPointsJson(e.target.value)}
            rows={10}
            required
            placeholder='[ { "lat": 37.77, "lng": -122.41, "recordedAt": "2023-01-01T10:00:00Z" } ]'
            style={{ width: '100%', fontFamily: 'monospace', padding: '0.5rem' }}
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Uploading...' : 'Upload Run'}
        </button>
      </form>
    </div>
  );
};
