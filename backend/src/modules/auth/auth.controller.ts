import { Request, Response, NextFunction } from 'express';
import * as authService from './auth.service';
import { JwtPayload } from 'jsonwebtoken';

const isProduction = process.env.NODE_ENV === 'production';

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { username, email, password } = req.body as Record<string, string>;
    const passwordHash = await authService.hashPassword(password);

    const user = await authService.createUser(username, email, passwordHash);

    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      accessToken,
    });
  } catch (err) {
    return next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void | Response> {
  try {
    const { email, password } = req.body as Record<string, string>;

    const user = await authService.getUserByEmail(email);
    if (!user) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const isValid = await authService.comparePassword(password, user.password_hash);
    if (!isValid) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    }

    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.display_name,
      },
      accessToken,
    });
  } catch (err) {
    return next(err);
  }
}

export async function refresh(req: Request, res: Response): Promise<void | Response> {
  try {
    const refreshToken = req.cookies.refreshToken as string | undefined;
    if (!refreshToken) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No refresh token' } });
    }

    const decoded = authService.verifyRefreshToken(refreshToken) as JwtPayload;
    if (!decoded.userId) {
      return res
        .status(401)
        .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token payload' } });
    }

    const user = await authService.getUserById(decoded.userId as string);
    if (!user) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'User not found' } });
    }

    if (user.token_version !== decoded.tokenVersion) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Token revoked' } });
    }

    const accessToken = authService.generateAccessToken(user);
    return res.status(200).json({ accessToken });
  } catch {
    return res
      .status(401)
      .json({ error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } });
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void | Response> {
  try {
    const refreshToken = req.cookies.refreshToken as string | undefined;
    if (refreshToken) {
      try {
        const decoded = authService.verifyRefreshToken(refreshToken) as JwtPayload;
        if (decoded.userId) {
          await authService.incrementTokenVersion(decoded.userId as string);
        }
      } catch (e) {
        // Ignore invalid token on logout
      }
    }
    
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
    });
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
}
