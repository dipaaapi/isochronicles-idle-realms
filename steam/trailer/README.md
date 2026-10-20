# Trailer

`trailer_draft_1920x1080.webm` is recorded straight from the live game by `npm run steam:capture -- trailer`: about 51 s at 24 fps, VP8, **no audio**. It goes title card → citadel by day → wave battle → storm at night → General brawl → snow realm → heatwave siege → title card.

Finish it before uploading:

1. **Edit**: cut it to 30–60 s and open on gameplay within the first 5 s (Valve's advice). Any editor works (DaVinci Resolve, Shotcut, CapCut).
2. **Audio**: add licensed music (not YouTube tracks) plus the game's SFX if you like.
3. **Export / re-encode** to what Steam wants, MP4 H.264 + AAC at 1920×1080, with a full ffmpeg:
   ```
   ffmpeg -i trailer_draft_1920x1080.webm -i music.mp3 -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest trailer_1920x1080.mp4
   ```
4. Upload under **Store Page Admin → Trailers**. Mark it as the first trailer so it autoplays on the store page.

Re-record any time after visual changes; the scenes are listed in `SCENES` in `scripts/steam-capture.cjs`.
