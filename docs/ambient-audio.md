# Ambient audio

The original track is referenced by `src/assets/cosmic-glow.mp3.asset.json`.
Its MP3 bytes are not included in this repository. The `/__l5e/assets-v1/…`
route is provided by Lovable; other deployments must supply an audio source.

To use the same track outside Lovable, obtain the original MP3 from the project
assets and place it at `public/audio/cosmic-glow.mp3`. Set this non-secret Vite
variable in `.env.local` for development and in the build environment for
deployment, then restart the dev server or rebuild:

```dotenv
VITE_AMBIENT_AUDIO_URL=/audio/cosmic-glow.mp3
```

Alternatively supply an HTTPS URL you control that serves playable audio,
not HTML or a login redirect. The override is public client configuration;
never put credentials or private signed URLs in it. Without an override the
existing Lovable asset URL is retained. No replacement track is generated.

Verify playback in the target browser. The player reports "on" only after
`playing`, handles rejected autoplay and media errors, and allows retries.
Loading and buffering time out after 15 seconds. Turning sound off cancels
pending playback; unmounting removes listeners and pauses it. Preferences are
saved after confirmed playback. Storage is optional.
