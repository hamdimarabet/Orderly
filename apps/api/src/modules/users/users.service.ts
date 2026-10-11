import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        storeAccess: {
          select: { storeId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        permissions: true,
        isActive: true,
        createdAt: true,
        storeAccess: { select: { storeId: true } },
      },
    });
  }

  async create(data: {
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF';
    password?: string;
    permissions?: string[];
    storeIds?: string[];
  }) {
    const passwordHash = await bcrypt.hash(data.password ?? 'changeme123', 10);

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        passwordHash,
        permissions: data.permissions ?? [],
        storeAccess: data.storeIds?.length
          ? {
              create: data.storeIds.map((storeId) => ({ storeId })),
            }
          : undefined,
      },
    });

    return user;
  }

  async invite(data: {
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF';
    permissions: string[];
    storeIds?: string[];
  }) {
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new Error('User already exists');

    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        passwordHash: '',
        permissions: data.permissions,
        inviteToken,
        inviteExpiry,
        isActive: false,
        storeAccess: data.storeIds?.length
          ? { create: data.storeIds.map((storeId) => ({ storeId })) }
          : undefined,
      },
    });

    return {
      user,
      inviteToken,
      inviteUrl: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/accept-invite?token=${inviteToken}`,
    };
  }

  async acceptInvite(token: string, password: string, name?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        inviteToken: token,
        inviteExpiry: { gt: new Date() },
      },
    });

    if (!user) throw new Error('Invalid or expired invite token');

    const passwordHash = await bcrypt.hash(password, 10);

    return this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        name: name ?? user.name,
        isActive: true,
        inviteToken: null,
        inviteExpiry: null,
      },
    });
  }

  async updateRole(id: string, role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF') {
    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  async updatePermissions(id: string, permissions: string[]) {
    return this.prisma.user.update({
      where: { id },
      data: { permissions },
    });
  }

  async updateStores(id: string, storeIds: string[]) {
    await this.prisma.userStoreAccess.deleteMany({ where: { userId: id } });
    if (storeIds.length > 0) {
      await this.prisma.userStoreAccess.createMany({
        data: storeIds.map((storeId) => ({ userId: id, storeId })),
      });
    }
    return this.findOne(id);
  }

  async toggleActive(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new Error('User not found');
    return this.prisma.user.update({
      where: { id },
      data: { isActive: !user.isActive },
    });
  }

  async remove(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
  async updateProfile(
    userId: string,
    data: { name?: string; email?: string },
  ) {
    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, id: { not: userId } },
      });
      if (existing) throw new Error('Cet email est déjà utilisé');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.email && { email: data.email }),
      },
      include: { storeAccess: true },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeIds: user.storeAccess.map((a) => a.storeId),
      permissions: user.permissions ?? [],
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return { ok: false, error: 'Utilisateur introuvable' };

    const bcrypt = require('bcrypt');
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) return { ok: false, error: 'Mot de passe actuel incorrect' };

    if (newPassword.length < 8) {
      return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères' };
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: hash },
    });

    return { ok: true };
  }
  async resetPassword(targetUserId: string, actorId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });

    if (actor?.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'Seul un super admin peut réinitialiser un mot de passe' };
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true },
    });
    if (!target) return { ok: false, error: 'Utilisateur introuvable' };

    // Generate a readable temporary password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let temp = '';
    for (let i = 0; i < 10; i++) {
      temp += chars[Math.floor(Math.random() * chars.length)];
    }

    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(temp, 10);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash: hash },
    });

    return {
      ok: true,
      tempPassword: temp,
      user: { name: target.name, email: target.email },
    };
  }
  async setPassword(targetUserId: string, newPassword: string, actorId: string) {
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { role: true },
    });

    if (actor?.role !== 'SUPER_ADMIN') {
      return { ok: false, error: 'Seul un super admin peut définir un mot de passe' };
    }

    if (newPassword.length < 8) {
      return { ok: false, error: 'Le mot de passe doit faire au moins 8 caractères' };
    }

    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash(newPassword, 10);

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { passwordHash: hash },
    });

    return { ok: true };
  }
}