import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Login } from '../Login';
import { api } from '../../api/axios';

vi.mock('../../api/axios', () => ({
  api: {
    post: vi.fn(),
  },
}));

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    login: vi.fn(),
  }),
}));

describe('Login Page', () => {
  const renderLogin = () =>
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

  it('renders login form', () => {
    renderLogin();
    expect(screen.getByText('Login to StrideWars')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('shows error on failed login', async () => {
    (api.post as import('vitest').Mock).mockRejectedValueOnce({
      response: { data: { error: { message: 'Invalid credentials' } } },
    });

    renderLogin();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrongpass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
    });
  });
});
