import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsObject,
  ValidateNested,
  Min,
  Max,
  IsPhoneNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PrintFormat, CoverType, PaymentGateway, OrderStatus } from '../enums/order.enum';

// ─── Adresse de livraison ──────────────────────────────────────────────────

export class ShippingAddressDto {
  @ApiProperty({ example: 'Kaboré Moussa' })
  @IsString()
  fullName: string;

  @ApiProperty({ example: 'Cocody, Rue des Jardins, Immeuble Palmier' })
  @IsString()
  addressLine1: string;

  @ApiPropertyOptional({ example: 'Appartement 4B' })
  @IsOptional()
  @IsString()
  addressLine2?: string;

  @ApiProperty({ example: 'Abidjan' })
  @IsString()
  city: string;

  @ApiPropertyOptional({ example: 'Abidjan' })
  @IsOptional()
  @IsString()
  region?: string;

  @ApiProperty({ example: 'CI' })
  @IsString()
  countryCode: string; // ISO 3166-1 alpha-2

  @ApiPropertyOptional({ example: '00225' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiProperty({ example: '+2250707000000' })
  @IsString()
  phone: string;
}

// ─── Créer une commande ────────────────────────────────────────────────────

export class CreateOrderDto {
  @ApiProperty({ description: 'ID du livre à imprimer', example: 'clxABC123' })
  @IsString()
  bookId: string;

  @ApiPropertyOptional({
    description: 'Format d\'impression',
    enum: PrintFormat,
    default: PrintFormat.A5,
  })
  @IsOptional()
  @IsEnum(PrintFormat)
  printFormat?: PrintFormat;

  @ApiPropertyOptional({
    description: 'Type de couverture',
    enum: CoverType,
    default: CoverType.PAPERBACK,
  })
  @IsOptional()
  @IsEnum(CoverType)
  coverType?: CoverType;

  @ApiProperty({
    description: 'Nombre d\'exemplaires',
    example: 2,
    minimum: 1,
    maximum: 500,
  })
  @IsInt()
  @Min(1)
  @Max(500)
  copies: number;

  @ApiProperty({
    description: 'Adresse de livraison complète',
    type: ShippingAddressDto,
  })
  @IsObject()
  @ValidateNested()
  @Type(() => ShippingAddressDto)
  shippingAddress: ShippingAddressDto;
}

// ─── Confirmer le paiement ────────────────────────────────────────────────

export class ConfirmPaymentDto {
  @ApiProperty({
    description: 'Passerelle de paiement utilisée',
    enum: PaymentGateway,
    example: PaymentGateway.MOBILE_MONEY,
  })
  @IsEnum(PaymentGateway)
  paymentGateway: PaymentGateway;

  @ApiProperty({
    description: 'Référence de la transaction',
    example: 'TXN-2024-00123456',
  })
  @IsString()
  paymentReference: string;
}

// ─── Mettre à jour le statut (admin/webhook) ──────────────────────────────

export class UpdateOrderStatusDto {
  @ApiProperty({
    description: 'Nouveau statut',
    enum: OrderStatus,
    example: OrderStatus.SHIPPED,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({
    description: 'Code de suivi (requis si statut = SHIPPED)',
    example: 'CI123456789FR',
  })
  @IsOptional()
  @IsString()
  trackingCode?: string;

  @ApiPropertyOptional({
    description: 'Note interne sur la transition',
    example: 'Expédié via DHL Express',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

// ─── Annuler une commande ─────────────────────────────────────────────────

export class CancelOrderDto {
  @ApiPropertyOptional({
    description: 'Raison de l\'annulation',
    example: 'Le client a changé d\'adresse',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}