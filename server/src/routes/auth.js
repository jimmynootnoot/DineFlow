import express from 'express';
import prisma from '../lib/prisma.js';
import { comparePassword, hashPassword } from '../lib/password.js';
import { signToken } from '../lib/auth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: 'Username and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const passwordMatches = await comparePassword(password, user.password);
    if (!passwordMatches) return res.status(401).json({ message: 'Invalid credentials' });

    const token = signToken({
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    });

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Login error', error);
    res.status(500).json({ message: 'Login failed' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { name, email, username, password } = req.body;
    if (!name || !email || !username || !password) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const existingUser = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (existingUser) {
      return res.status(400).json({ message: 'Username or email already taken' });
    }

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        username,
        role: 'CUSTOMER',
        password: await hashPassword(password),
      },
    });

    const token = signToken({ id: newUser.id, role: newUser.role, name: newUser.name, username: newUser.username });

    res.status(201).json({
      token,
      user: {
        id: newUser.id,
        role: newUser.role,
        name: newUser.name,
        username: newUser.username,
      },
    });
  } catch (error) {
    console.error('Signup error', error);
    res.status(500).json({ message: 'Signup failed' });
  }
});

export default router;
