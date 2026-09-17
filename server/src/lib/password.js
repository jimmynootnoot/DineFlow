import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const hashPassword = async (plaintext) => bcrypt.hash(plaintext, SALT_ROUNDS);
export const comparePassword = async (plaintext, hash) => bcrypt.compare(plaintext, hash);
