import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const menu = await prisma.menuItem.findMany({ orderBy: { id: 'asc' } });
  res.json(menu);
});

router.post('/', authMiddleware(['ADMIN', 'CASHIER']), async (req, res) => {
  try {
    const { itemName, description, price, available } = req.body;
    const menuItem = await prisma.menuItem.create({
      data: { itemName, description, price, available },
    });
    res.status(201).json(menuItem);
  } catch (error) {
    console.error('Create menu error', error);
    res.status(500).json({ message: 'Failed to create menu item' });
  }
});

router.patch('/:id/availability', authMiddleware(['ADMIN', 'CASHIER']), async (req, res) => {
  try {
    const { id } = req.params;
    const menuItem = await prisma.menuItem.update({
      where: { id: Number(id) },
      data: { available: req.body.available },
    });
    res.json(menuItem);
  } catch (error) {
    console.error('Update availability error', error);
    res.status(500).json({ message: 'Failed to update availability' });
  }
});

export default router;
