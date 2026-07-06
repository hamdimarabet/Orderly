import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Post()
  create(@Body() body: {
    name: string;
    email: string;
    password: string;
    role: UserRole;
    storeIds: string[];
  }) {
    return this.users.create(body);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() body: { role: UserRole },
  ) {
    return this.users.updateRole(id, body.role);
  }

  @Patch(':id/stores')
  updateStores(
    @Param('id') id: string,
    @Body() body: { storeIds: string[] },
  ) {
    return this.users.updateStoreAccess(id, body.storeIds);
  }
}