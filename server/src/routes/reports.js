import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

router.get('/sales', authMiddleware(['ADMIN', 'CASHIER']), async (_req, res) => {
  try {
    const completedOrders = await prisma.order.findMany({
      where: { status: 'COMPLETED' },
      include: { items: true },
    });

    const totalSales = completedOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const dineIn = completedOrders.filter((order) => order.type === 'DINE_IN').length;
    const pickup = completedOrders.filter((order) => order.type === 'PICKUP').length;

    res.json({
      totalOrders: completedOrders.length,
      completedOrders: completedOrders.length,
      totalSales,
      dineIn,
      pickup,
    });
  } catch (error) {
    console.error('Sales report error', error);
    res.status(500).json({ message: 'Failed to fetch sales report' });
  }
});

export default router;
