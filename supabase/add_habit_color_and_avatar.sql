-- Add color column to user_habits and avatar_url to profiles.
-- Run this in Supabase SQL Editor.

alter table public.user_habits
  add column if not exists color text;

alter table public.profiles
  add column if not exists avatar_url text;
