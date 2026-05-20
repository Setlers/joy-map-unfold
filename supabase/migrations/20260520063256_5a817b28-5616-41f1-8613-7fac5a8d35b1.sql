ALTER TABLE public.emotions ADD COLUMN message text;
ALTER TABLE public.emotions ADD CONSTRAINT emotions_message_length CHECK (message IS NULL OR char_length(message) <= 140);