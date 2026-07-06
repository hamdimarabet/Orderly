import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      include: { storeAccess: true },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      isActive: true,
      storeIds: u.storeAccess.map((a) => a.storeId),
      avatarInitials: u.name.split(' ').map((n) => n[0]).join('').toUpperCase(),
      createdAt: u.createdAt,
    }));
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    storeIds: string[];
  }) {
    const hash = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        passwordHash: hash,
        role: data.role,
        storeAccess: {
          create: data.storeIds.map((storeId) => ({ storeId })),
        },
      },
    });
  }

  async updateRole(id: string, role: UserRole) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
    });
  }

  async updateStoreAccess(id: string, storeIds: string[]) {
    await this.prisma.userStoreAccess.deleteMany({ where: { userId: id } });
    await this.prisma.userStoreAccess.createMany({
      data: storeIds.map((storeId) => ({ userId: id, storeId })),
    });
    return { updated: true };
  }
}