# The repository layer

Every Prisma call lives in a repository. Services hold business rules and call repositories;
controllers call services. The payoff is that a query has one definition — when a filter,
a soft-delete flag, or a tenant scope changes, it changes in one place.

## `common/repositories/base.repository.ts`

```ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import { IRepository } from '../interfaces/repository.interface';

@Injectable()
export abstract class BaseRepository<T, CreateDto, UpdateDto>
  implements IRepository<T, CreateDto, UpdateDto>
{
  constructor(
    protected readonly databaseService: DatabaseService,
    protected readonly modelName: string,
  ) {}

  protected get model() {
    return this.databaseService[this.modelName];
  }

  async create(data: CreateDto): Promise<T> {
    return this.model.create({ data });
  }

  async findAll(): Promise<T[]> {
    return this.model.findMany();
  }

  /**
   * Generic pagination with search. Override in a repository to fix its searchable fields.
   *
   * @example
   * async findAllWithPagination(page = 1, limit = 10, search?: string) {
   *   return super.findAllWithPagination(page, limit, search, ['name', 'email', 'phone']);
   * }
   */
  async findAllWithPagination(
    page = 1,
    limit = 10,
    search?: string,
    searchFields?: string[],
    where?: any,
  ): Promise<{
    data: T[]; total: number; page: number; limit: number;
    hasNextPage: boolean; hasPreviousPage: boolean;
  }> {
    if (limit > 20) limit = 20;

    const whereCondition: any = { ...where };
    if (search && searchFields?.length) {
      whereCondition.OR = searchFields.map((field) => ({
        [field]: { contains: search, mode: 'insensitive' },
      }));
    }

    const data = await this.model.findMany({
      skip: (page - 1) * limit,
      take: limit,
      where: whereCondition,
    });
    const total = await this.model.count({ where: whereCondition });

    return {
      data,
      total,
      page,
      limit,
      hasNextPage: page * limit < total,
      hasPreviousPage: page > 1,
    };
  }

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateDto): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.model.delete({ where: { id } });
  }
}
```

`limit` is capped at 20 inside the base class, not at the controller — a caller cannot ask
for 10,000 rows by editing a query string.

## A domain, end to end

The domain declares its contract in `interfaces/`, and the repository implements it. The
model type comes from Prisma — never from a hand-written entity:

```ts
// domains/booking/interfaces/booking-repository.interface.ts
import type { Booking } from '@prisma/client';   // generated, always matches the schema

export interface IBookingRepository extends IRepository<Booking, CreateBookingDto, UpdateBookingDto> {
  // Domain-specific methods get declared here as they appear.
  findUpcomingFor(userId: string): Promise<Booking[]>;
}
```

```ts
// domains/booking/repositories/booking.repository.ts
import type { Booking } from '@prisma/client';

@Injectable()
export class BookingRepository
  extends BaseRepository<Booking, CreateBookingDto, UpdateBookingDto>
  implements IBookingRepository
{
  constructor(db: DatabaseService) {
    super(db, 'booking');
  }

  // Scope lives here, so no caller can forget it.
  async findAllWithPagination(page = 1, limit = 10, search?: string, userId?: string) {
    return super.findAllWithPagination(page, limit, search, ['reference', 'notes'], { userId });
  }
}
```

```ts
// domains/booking/booking.service.ts — business rules, no Prisma
@Injectable()
export class BookingService {
  constructor(private readonly bookings: BookingRepository) {}

  async findOne(id: string, userId: string): Promise<Booking> {
    const booking = await this.bookings.findById(id);
    if (!booking) throw new NotFoundException('Booking not found');
    // Ownership from the token, never from the request payload.
    if (booking.userId !== userId) throw new ForbiddenException();
    return booking;
  }
}
```

```ts
// domains/booking/booking.controller.ts — HTTP only
@Controller('bookings')
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser('id') userId: string) {
    return this.service.findOne(id, userId);   // interceptor envelopes it
  }

  @Get()
  async findAll(@Query() query: PaginationQueryDto, @GetUser('id') userId: string) {
    const { data, ...meta } = await this.service.findAll(query, userId);
    return ResponseUtil.success(data, 'Data retrieved successfully', HttpStatus.OK, undefined, meta);
  }
}
```

The list route is the one place a controller builds the envelope by hand — `meta` has to be
split out of the paginated result, and the interceptor cannot know which keys are metadata.

## Rules

- **A repository owns its scope.** Tenant, user, and soft-delete filters belong in the
  repository override, not repeated at every call site.
- **Repositories never throw HTTP exceptions.** They return `null`; the service decides
  whether that is a 404 or a legitimate empty result.
- **Services never import Prisma.** If a service needs a query that does not exist, add a
  repository method.
- **The row type comes from `@prisma/client`**, never a hand-written entity. The generated
  type is regenerated from the schema on every `prisma generate`; a copy is not.
- **A raw `databaseService` call outside a repository is a shortcut with a cost** — the next
  person adding a scope filter will miss it.
