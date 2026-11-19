-- Add the supervisor role required by TaskPilot's team view.
-- Keep the existing accountant label for the expense tables already in this project.
alter type public.app_role add value if not exists 'supervisor';
