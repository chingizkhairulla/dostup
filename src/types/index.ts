export interface Product {
  id: string;
  title: string;
  headline: string;
  description: string;
  price: number;
  currency: string;
  image_url: string;
  video_url?: string | null;
  media?: Array<{ type: "image" | "video"; url: string }> | null;
  has_schedule: boolean;
  creator_id: string;
  created_at: string;
  payment_methods?: PaymentMethod[];
  payment_method_ids?: string[];
}

export type PaymentMethodType = 'link' | 'phone' | 'card';
export type PaymentMethodBank = 'kaspi' | 'halyk' | 'freedom' | 'other';

export interface PaymentMethod {
  id: string;
  profile_id: string;
  type: PaymentMethodType;
  bank?: PaymentMethodBank | null;
  bank_name?: string | null;
  value: string;
  recipient_name?: string | null;
  sort_order: number;
  created_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  created_at: string;
}

export interface Purchase {
  id: string;
  user_id: string;
  product_id: string;
  amount: number;
  status: 'pending' | 'completed' | 'failed';
  created_at: string;
}

export interface Material {
  id: string;
  product_id: string;
  title: string;
  type: 'file' | 'video' | 'text';
  content: string;
  file_url?: string;
  order: number;
  created_at: string;
}

export interface Schedule {
  id: string;
  product_id: string;
  title: string;
  type: 'group' | 'individual';
  capacity?: number;
  created_at: string;
}

export interface TimeSlot {
  id: string;
  schedule_id: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
}

export interface Booking {
  id: string;
  user_id: string;
  time_slot_id: string;
  schedule_id: string;
  status: 'confirmed' | 'cancelled';
  created_at: string;
}
