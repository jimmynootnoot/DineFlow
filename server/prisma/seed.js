import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import { hashPassword } from '../src/lib/password.js';

const seedUsers = [
  { username: 'admin', name: 'Administrator', email: 'admin@example.com', password: 'admin123', role: 'ADMIN' },
  { username: 'johndoe', name: 'John Doe', email: 'johndoe@example.com', password: '1234', role: 'CUSTOMER' },
  { username: 'kitchen01', name: 'Kitchen User', email: 'kitchen01@example.com', password: 'kitchen123', role: 'KITCHEN', staffCode: 'KIT-01' },
  { username: 'cashier01', name: 'Cashier User', email: 'cashier01@example.com', password: 'cashier123', role: 'CASHIER', staffCode: 'CAS-01' },
];

const seedMenu = [
  {
    itemName: 'Classic Burger',
    description: 'Grilled beef patty with lettuce, tomato, and special sauce',
    price: 8.99,
    available: true,
  },
  {
    itemName: 'Fries Basket',
    description: 'Crispy golden fries served with dipping sauce',
    price: 3.49,
    available: true,
  },
  {
    itemName: 'Chicken Nuggets',
    description: 'Juicy bite-sized chicken nuggets',
    price: 5.99,
    available: true,
  },
];

async function run() {
  try {
    console.log('Clearing existing data...');
    await prisma.orderItem.deleteMany();
    await prisma.payment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.menuItem.deleteMany();
    await prisma.user.deleteMany();

    console.log('Seeding users...');
    for (const user of seedUsers) {
      await prisma.user.create({
        data: {
          username: user.username,
          name: user.name,
          email: user.email,
          role: user.role,
          staffCode: user.staffCode,
          password: await hashPassword(user.password),
        },
      });
    }

    console.log('Seeding menu...');
    for (const menu of seedMenu) {
      await prisma.menuItem.create({
        data: menu,
      });
    }

    console.log('Seed complete!');
  } catch (error) {
    console.error('Seed failed', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

run();
