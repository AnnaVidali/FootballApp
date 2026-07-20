-- Football Team Manager App - Database Schema

-- Teams table
CREATE TABLE teams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles table
CREATE TABLE profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  position TEXT,
  role TEXT DEFAULT 'player' NOT NULL CHECK (role IN ('coach', 'player')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Events table (matches and trainings)
CREATE TABLE events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('match', 'training')),
  title TEXT NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Availability table
CREATE TABLE availability (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('available', 'unavailable', 'maybe')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(user_id, event_id)
);

-- Lineups table
CREATE TABLE lineups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  shirt_number INTEGER,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(event_id, player_id)
);

-- Enable Row Level Security
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups ENABLE ROW LEVEL SECURITY;

-- Teams policies
CREATE POLICY "Users can view their own team" ON teams
  FOR SELECT USING (id = (SELECT team_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can update their team" ON teams
  FOR UPDATE USING (coach_id = auth.uid());

CREATE POLICY "Users can create teams" ON teams
  FOR INSERT WITH CHECK (coach_id = auth.uid());

-- Profiles policies
CREATE POLICY "Users can view profiles in their team" ON profiles
  FOR SELECT USING (team_id = (SELECT team_id FROM profiles WHERE user_id = auth.uid()) OR user_id = auth.uid());

CREATE POLICY "Users can update their own profile" ON profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" ON profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Events policies
CREATE POLICY "Team members can view events" ON events
  FOR SELECT USING (team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Coaches can manage events" ON events
  FOR ALL USING (team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND role = 'coach'));

-- Availability policies
CREATE POLICY "Team members can view availability" ON availability
  FOR SELECT USING (event_id IN (SELECT id FROM events WHERE team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())));

CREATE POLICY "Users can manage their own availability" ON availability
  FOR ALL USING (user_id = auth.uid());

-- Lineups policies
CREATE POLICY "Team members can view lineups" ON lineups
  FOR SELECT USING (event_id IN (SELECT id FROM events WHERE team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid())));

CREATE POLICY "Coaches can manage lineups" ON lineups
  FOR ALL USING (event_id IN (SELECT id FROM events WHERE team_id IN (SELECT team_id FROM profiles WHERE user_id = auth.uid() AND role = 'coach')));

-- Function to generate invite codes
CREATE OR REPLACE FUNCTION generate_invite_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_code IS NULL OR NEW.invite_code = '' THEN
    NEW.invite_code := upper(substring(md5(random()::text) from 1 for 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'Unknown'),
    COALESCE(NEW.raw_user_meta_data->>'role', 'player')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on new auth user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to auto-generate invite codes
CREATE TRIGGER set_invite_code
  BEFORE INSERT ON teams
  FOR EACH ROW
  EXECUTE FUNCTION generate_invite_code();
