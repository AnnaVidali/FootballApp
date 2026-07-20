export interface Team {
  id: string;
  name: string;
  coach_id: string;
  invite_code: string;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  team_id: string | null;
  name: string;
  position: string | null;
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
  created_at: string;
}
