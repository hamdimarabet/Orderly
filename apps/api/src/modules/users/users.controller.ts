
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, SetMetadata } from '@nestjs/common';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.users.findOne(id);
  }

  @Post()
  create(@Body() body: {
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF';
    password?: string;
    permissions?: string[];
    storeIds?: string[];
  }) {
    return this.users.create(body);
  }
  @Post(':id/reset-password')
  resetPassword(@Param('id') id: string, @Request() req: any) {
    return this.users.resetPassword(id, req.user.id);
  }
  @Patch(':id/password-admin')
  setPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
    @Request() req: any,
  ) {
    return this.users.setPassword(id, body.password, req.user.id);
  }
  @Patch('me/profile')
  updateProfile(@Body() body: any, @Request() req: any) {
    return this.users.updateProfile(req.user.id, body);
  }

  @Patch('me/password')
  changePassword(
    @Body() body: { currentPassword: string; newPassword: string },
    @Request() req: any,
  ) {
    return this.users.changePassword(req.user.id, body.currentPassword, body.newPassword);
  }
  @Post('invite')
  invite(@Body() body: {
    email: string;
    name: string;
    role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF';
    permissions: string[];
    storeIds?: string[];
  }) {
    return this.users.invite(body);
  }
  @Post('accept-invite')
  @SetMetadata('isPublic', true)
  acceptInvite(@Body() body: { token: string; password: string; name?: string }) {
    return this.users.acceptInvite(body.token, body.password, body.name);
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() body: { role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'STAFF' },
  ) {
    return this.users.updateRole(id, body.role);
  }

  @Patch(':id/permissions')
  updatePermissions(
    @Param('id') id: string,
    @Body() body: { permissions: string[] },
  ) {
    return this.users.updatePermissions(id, body.permissions);
  }

  @Patch(':id/stores')
  updateStores(
    @Param('id') id: string,
    @Body() body: { storeIds: string[] },
  ) {
    return this.users.updateStores(id, body.storeIds);
  }

  @Patch(':id/toggle')
  toggleActive(@Param('id') id: string) {
    return this.users.toggleActive(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.users.remove(id);
  }
}