# DTOs

A DTO is the request contract. With `whitelist` and `forbidNonWhitelisted` on the global
pipe, anything not declared on the DTO is stripped or rejected — so the DTO is the *only*
thing standing between a request body and a service.

## Naming and location

```
domains/booking/dto/
  create-booking.dto.ts     CreateBookingDto
  update-booking.dto.ts     UpdateBookingDto
  booking.query.dto.ts      BookingQueryDto
```

kebab-case files, PascalCase classes, one class per file. Shared shapes
(`PaginationQueryDto`) live in `common/dto/`.

## Create

Every field declared, every field decorated. An undecorated property is invisible to the
pipe and gets stripped — silently.

```ts
import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString } from 'class-validator'
import { BookingStatus } from '@prisma/client'   // enum from Prisma, one source of truth

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  serviceId: string

  @IsString()
  @IsOptional()
  washerId?: string

  @IsEnum(BookingStatus)
  @IsOptional()
  status?: BookingStatus = BookingStatus.PENDING

  @IsDateString()
  @IsOptional()
  scheduledAt?: string      // IsDateString validates a STRING — see below
}
```

**Import enums from `@prisma/client`.** A hand-declared copy drifts from the schema and the
mismatch surfaces at runtime as a database error.

**No `customerId` / `userId` / `tenantId` in a create DTO.** Ownership comes from the token.
A create body that names its own owner lets any caller create rows for anyone else — this is
the single most common instance of the ownership rule in the main skill.

## Update: derive, don't retype

```ts
import { PartialType } from '@nestjs/mapped-types'
import { CreateBookingDto } from './create-booking.dto'

export class UpdateBookingDto extends PartialType(CreateBookingDto) {}
```

Every field optional, validators inherited, and a new field on create is automatically
updatable. A hand-written update DTO drifts the moment create gains a field.

Retype it only when update genuinely accepts a *different* set — a status-only transition
endpoint is its own DTO, not a partial.

Composition works the same way: `class RegisterDto extends CreateUserDto` adds a field
to an existing contract instead of duplicating it.

## Query DTOs need `@Type`

Query strings arrive as strings. Without `@Type`, `@IsPositive()` runs against `"2"` and
fails, or a number reaches the service as a string.

```ts
import { Type } from 'class-transformer'
import { IsOptional, IsPositive, IsString, Min, Max } from 'class-validator'

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  @Max(20)          // must match the repository cap, or the limit lies
  limit: number = 10

  @IsOptional()
  @IsString()
  search?: string
}
```

`transform: true` on the global pipe is what makes `@Type` run. Booleans need it too —
`@Type(() => Boolean)` on `?active=true`, or the string `"false"` arrives truthy.

## Nested objects and arrays

`class-validator` does not descend automatically. Both decorators are required:

```ts
class AddressDto {
  @IsString() @IsNotEmpty() street: string
  @IsString() @IsNotEmpty() city: string
}

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => AddressDto)          // without this, plain object — nothing validates
  address: AddressDto

  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  @ArrayMinSize(1)
  items: OrderItemDto[]
}
```

Missing `@Type` on a nested field is a silent hole: validation passes and nothing was
checked.

## Rules

- **Never type a body as `any`, a bare interface, or a Prisma model.** An interface has no
  runtime existence, so the pipe validates nothing.
- **Decorate every property.** Undecorated means stripped by `whitelist`.
- **A DTO validates shape, not business rules.** "Is this slot free" belongs in the service —
  it needs the database.
- **`@IsDateString()` validates a string and leaves it a string.** Typing that field `Date`
  is a lie the compiler accepts. Either type it `string`, or use `@Type(() => Date)`.
- **Match `@Max` on `limit` to the repository's cap.** Different numbers means a request
  passes validation asking for 50 and silently receives 20.
- **DTOs are for input.** Response shape is the envelope plus an explicit Prisma `select` —
  don't build response DTOs to hide fields the query should not have fetched.
