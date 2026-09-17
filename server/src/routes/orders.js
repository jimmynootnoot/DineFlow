import express from 'express';
import prisma from '../lib/prisma.js';
import { authMiddleware } from '../lib/auth.js';

const router = express.Router();

router.get('/', authMiddleware(['ADMIN', 'KITCHEN', 'CASHIER']), async (_req, res) => {
  const orders = await prisma.order.findMany({
    include: { items: { include: { menuItem: true } }, customer: true },
    orderBy: { createdAt: 'desc' },
  });
  res.json(orders);
});

router.post('/', authMiddleware(['ADMIN', 'CASHIER', 'CUSTOMER']), async (req, res) => {
  try {
    const { customerName, menuItems, type, note } = req.body;

    if (!menuItems?.length) return res.status(400).json({ message: 'No menu items selected' });

    const customer = await prisma.user.findUnique({ where: { id: req.user.id } });

    const items = await prisma.menuItem.findMany({ where: { id: { in: menuItems } } });
    const orderItemsData = items.map((item) => ({
      menuId: item.id,
      quantity: 1,
      subtotal: item.price,
    }));

    const total = orderItemsData.reduce((sum, item) => sum + Number(item.subtotal), 0);

    const order = await prisma.order.create({
      data: {
        customer: { connect: { id: customer.id } },
        type,
        status: 'NEW',
        total,
        items: { create: orderItemsData },
        note,
      },
      include: { items: { include: { menuItem: true } }, customer: true },
    });

    res.status(201).json(order);
  } catch (error) {
    console.error('Create order error', error);
    res.status(500).json({ message: 'Failed to create order' });
  }
});

router.patch('/:id/status', authMiddleware(['ADMIN', 'KITCHEN']), async (req, res) => {
  try {
    const order = await prisma.order.update({
      where: { id: Number(req.params.id) },
      data: { status: req.body.status },
      include: { items: { include: { menuItem: true } }, customer: true },
    });

    res.json(order);
  } catch (error) {
    console.error('Update status error', error);
    res.status(500).json({ message: 'Failed to update order status' });
  }
});

export default router;
