import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { ApiException } from '../common/api-exception';
import { compare } from 'bcryptjs';

type LoginDto = {
  email: string;
  password: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: {
          include: { role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new ApiException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        status: 401,
      });
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new ApiException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Invalid email or password',
        status: 401,
      });
    }

    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
    });

    const role = user.memberships[0]?.role?.name ?? 'Viewer';

    return {
      token,
      user: { id: user.id, name: user.name, email: user.email, role },
    };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          include: { role: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });
    if (!user) {
      throw new ApiException({
        code: 'AUTH_USER_NOT_FOUND',
        message: 'User not found',
        status: 401,
      });
    }

    const role = user.memberships[0]?.role?.name ?? 'Viewer';
    return { id: user.id, name: user.name, email: user.email, role };
  }
}
