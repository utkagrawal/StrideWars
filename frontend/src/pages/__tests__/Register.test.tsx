import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Register } from '../Register';
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

describe('Register Page', () => {
  const renderRegister = () =>
    render(
      <BrowserRouter>
        <Register />
      </BrowserRouter>
    );

  it('renders register form', () => {
    renderRegister();
    expect(screen.getByText('Join StrideWars')).toBeInTheDocument();
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('shows validation errors', async () => {
    (api.post as import('vitest').Mock).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ msg: 'Password too short' }],
          },
        },
      },
    });

    renderRegister();

    fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'test' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register' }));

    await waitFor(() => {
      expect(screen.getByText('Password too short')).toBeInTheDocument();
    });
  });
});
