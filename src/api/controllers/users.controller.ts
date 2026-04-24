import { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import pool from "../db.js";

export interface User extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  created_at: string;
  updated_at: string;
}

const JWT_SECRET = process.env.JWT_SECRET ?? "change-me-in-production";
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN ?? "7d") as string;
const SALT_ROUNDS = 12;

function toPublic(row: User): UserPublic {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

function signToken(user: UserPublic): string {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
  );
}

// ── REGISTER ──────────────────────────────────────────────────────────
export async function registerUser(data: {
  email: string;
  password: string;
  name: string;
}): Promise<{ user: UserPublic; token: string }> {
  const [existing] = await pool.query<User[]>(
    "SELECT id FROM users WHERE email = ?",
    [data.email.toLowerCase()],
  );
  if ((existing as User[]).length) {
    throw Object.assign(new Error("Email already registered"), { code: "EMAIL_TAKEN" });
  }

  const id = randomUUID();
  const password_hash = await bcrypt.hash(data.password, SALT_ROUNDS);

  await pool.query<ResultSetHeader>(
    `INSERT INTO users (id, email, password_hash, name, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(3), NOW(3))`,
    [id, data.email.toLowerCase(), password_hash, data.name],
  );

  const user = await getUserById(id);
  return { user: user!, token: signToken(user!) };
}

// ── LOGIN ─────────────────────────────────────────────────────────────
export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: UserPublic; token: string }> {
  const [rows] = await pool.query<User[]>(
    "SELECT * FROM users WHERE email = ?",
    [email.toLowerCase()],
  );
  const row = (rows as User[])[0];

  if (!row) {
    throw Object.assign(new Error("Invalid credentials"), { code: "INVALID_CREDENTIALS" });
  }

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    throw Object.assign(new Error("Invalid credentials"), { code: "INVALID_CREDENTIALS" });
  }

  await pool.query(
    "UPDATE users SET updated_at = NOW(3) WHERE id = ?",
    [row.id],
  );

  const user = toPublic(row);
  return { user, token: signToken(user) };
}

// ── GET BY ID ─────────────────────────────────────────────────────────
export async function getUserById(id: string): Promise<UserPublic | null> {
  const [rows] = await pool.query<User[]>("SELECT * FROM users WHERE id = ?", [id]);
  return (rows as User[]).length ? toPublic((rows as User[])[0]) : null;
}

// ── SCHEMA BOOTSTRAP ──────────────────────────────────────────────────
export async function createUsersTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            VARCHAR(36)   NOT NULL PRIMARY KEY,
      email         VARCHAR(255)  NOT NULL,
      password_hash VARCHAR(255)  NOT NULL,
      name          VARCHAR(128)  NOT NULL,
      created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_users_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
