export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PRINTING = 'PRINTING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum PrintFormat {
  A4 = 'A4',
  A5 = 'A5',
  POCKET = 'POCKET',
  SQUARE = 'SQUARE',
}

export enum CoverType {
  PAPERBACK = 'PAPERBACK',
  HARDCOVER = 'HARDCOVER',
}

export enum PaymentGateway {
  STRIPE = 'STRIPE',
  FLUTTERWAVE = 'FLUTTERWAVE',
  MOBILE_MONEY = 'MOBILE_MONEY',
}

// Grille tarifaire (centimes XOF)
// Prix par page selon format
export const PRICE_PER_PAGE: Record<PrintFormat, number> = {
  [PrintFormat.A4]: 25,      // 25 XOF / page
  [PrintFormat.A5]: 18,      // 18 XOF / page
  [PrintFormat.POCKET]: 15,  // 15 XOF / page
  [PrintFormat.SQUARE]: 22,  // 22 XOF / page
};

// Supplément couverture rigide
export const HARDCOVER_SURCHARGE = 150000; // +1500 XOF

// Transitions de statut autorisées
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]:   [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PRINTING,  OrderStatus.CANCELLED],
  [OrderStatus.PRINTING]:  [OrderStatus.SHIPPED],
  [OrderStatus.SHIPPED]:   [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]:  [],
};