// Types partagés entre l'API (Hono/Workers) et le front (Next.js).

export type EventType = "private" | "ticketed";
export type EventStatus = "draft" | "published" | "archived";
export type RsvpStatus = "pending" | "yes" | "no";
export type TicketStatus = "valid" | "used" | "refunded" | "void";
export type TransactionStatus = "pending" | "paid" | "refunded" | "canceled";
export type RefundRequestStatus = "pending" | "approved" | "rejected";
export type RefundPolicyKind = "full" | "partial" | "none";

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}

export interface RefundPolicy {
  kind: RefundPolicyKind;
  /** Remboursement possible jusqu'à X jours avant l'événement */
  days_before: number;
  /** Pourcentage remboursé si kind === "partial" (0–100) */
  percent: number;
}

export interface EventRecord {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  address: string | null;
  dress_code: string | null;
  seating_plan: string | null;
  capacity: number;
  public_slug: string;
  scanner_key: string;
  type: EventType;
  status: EventStatus;
  refund_policy: string | null; // JSON RefundPolicy
  created_at: string;
  updated_at: string;
}

export interface Guest {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  token: string;
  table_name: string | null;
  plus_ones: number;
  rsvp_status: RsvpStatus;
  rsvp_at: string | null;
  opened_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: string;
  event_id: string;
  body: string;
  created_at: string;
}

export interface TicketCategory {
  id: string;
  event_id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  quantity: number;
  sold: number;
  created_at: string;
}

export interface Seller {
  id: string;
  event_id: string;
  name: string;
  email: string | null;
  code: string;
  created_at: string;
}

export interface SellerQuota {
  id: string;
  seller_id: string;
  category_id: string;
  quota: number;
  sold: number;
}

export interface Ticket {
  id: string;
  event_id: string;
  category_id: string;
  transaction_id: string;
  seller_id: string | null;
  buyer_name: string;
  buyer_email: string;
  serial: string;
  status: TicketStatus;
  used_at: string | null;
  created_at: string;
}

export interface TransactionRecord {
  id: string;
  event_id: string;
  category_id: string;
  seller_id: string | null;
  buyer_name: string;
  buyer_email: string;
  quantity: number;
  amount_cents: number;
  currency: string;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  status: TransactionStatus;
  created_at: string;
}

export interface RefundRequest {
  id: string;
  ticket_id: string;
  transaction_id: string;
  reason: string | null;
  status: RefundRequestStatus;
  decided_at: string | null;
  stripe_refund_id: string | null;
  refund_amount_cents: number | null;
  created_at: string;
}

export interface Media {
  id: string;
  event_id: string;
  guest_id: string | null;
  r2_key: string;
  content_type: string;
  created_at: string;
}

export interface ScanResult {
  ok: boolean;
  status: "valid" | "already_used" | "invalid_signature" | "not_found" | "refunded" | "void";
  ticket?: Pick<Ticket, "serial" | "buyer_name" | "status" | "used_at"> & {
    category_name?: string;
  };
  message: string;
}
