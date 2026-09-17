const DEFAULT_DATABASE_URL = 'postgres://6e2117c01c4b92e7a96575bec41a229ed7bdf60fc497fc470226ce699f14edf7:sk_dtyR4vYmjqZbIJY-MOzzC@db.prisma.io:5432/postgres?sslmode=require';

export const databaseConfig = {
  provider: 'postgresql',
  connectionString: process.env.REACT_APP_DATABASE_URL || DEFAULT_DATABASE_URL,
  envVariable: 'REACT_APP_DATABASE_URL',
};

export const getMaskedConnectionString = (connectionString = '') => {
  if (!connectionString) return '';
  return connectionString.replace(/:(.*?)@/, ':••••@');
};
