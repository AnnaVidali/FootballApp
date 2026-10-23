export interface Team {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  position: string | null;
  shirt_number: number | null;
  role: "coach" | "player";
  is_admin: boolean;
  created_at: string;
}

export interface Event {
  id: string;
  team_id: string;
  type: "match" | "training";
  title: string;
  date: string;
  location: string | null;
  formation: string | null;
  captain_id: string | null;
  created_at: string;
}

export interface Availability {
  id: string;
  user_id: string;
  event_id: string;
  status: "available" | "unavailable" | "maybe";
  created_at: string;
}

export interface Lineup {
  id: string;
  event_id: string;
  player_id: string;
  position: string;
  shirt_number: number | null;
  pos_x: number | null;
  pos_y: number | null;
  created_at: string;
}

export interface SetPiece {
  id: string;
  event_id: string;
  piece_type: "foul" | "corner" | "penalty";
  player_id: string;
  created_at: string;
}

export interface GalleryItem {
  id: string;
  team_id: string;
  event_id: string | null;
  uploaded_by: string;
  kind: "photo" | "link";
  storage_path: string | null;
  external_url: string | null;
  caption: string | null;
  created_at: string;
}

export interface Reservation {
  id: string;
  event_id: string;
  created_by: string;
  amount: number;
  closed_at: string | null;
  created_at: string;
}

export interface ReservationPayment {
  id: string;
  reservation_id: string;
  user_id: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}
