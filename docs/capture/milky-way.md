# Milky Way shots for clips

Starting shots of the Milky Way for capture mode (D-55, [ux.md §14](../plan/ux.md#14-capture-mode)), as links. Each opens framed at 9:16 for Reels and Stories, with the camera at the shot's start: press **R** to save it as a 1080 × 1920 video, or **P** to play it on screen. Change `9x16` to `4x5` or `3x4` for a feed post: the same poses, a wider frame.

Capture mode is on production since `v0.10.0`; recording (R) comes with the release after it. On your own machine, replace `https://galaxyexplorer.perturbatory.com` with `http://localhost:5173`, and in the two Solar System links, the Solar System's id with your copy's (its galaxy-view link has it after `/view/`).

## Recording one

1. Open the link. The card beside the frame lists the keys.
2. Choose the labels with **L** (production shows all of them; the first mode shows none but the selection's). Hide groups' outlines in **Layers** before entering capture mode if they're in the way. What you see is what's recorded.
3. Press **R**. The move is drawn frame by frame into an MP4 of exactly 1080 × 1920 (a still second, the move, a still second) and saved to your downloads, named like `milky-way-present-day-9x16-2026-11-18-1932.mp4`. It takes a few seconds; Esc stops it. Add `&fps=60` to the address for 60 frames a second.
4. Post the file as it is.

**P** plays the move on screen instead, to check it before recording. If the browser can't encode H.264, the card says so; then screen-record the frame: ⇧⌘5, **Record Selected Portion** over the frame, start, and press **P**.

To make your own: move the camera where the shot should start and press **A**, then where it should end and press **B**; `,` and `.` make it shorter or longer. The address bar then holds the whole shot, to bookmark or add here.

## The shots

| Shot | Length | What it does |
|---|---|---|
| [The whole disc, turning](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day?capture=9x16&cam=0,125000,60000,0,0,0&spin=60&secs=20) | 20 s | the disc from high above, turning 60° about Sagittarius A\*; a calm opener or background |
| [Into the heart](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day?capture=9x16&cam=0,125000,60000,0,0,0&to=21000,8000,11200,0,0,0&secs=12) | 12 s | from the whole disc down to the bulge, low across the plane, turning as it goes |
| [You are here](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day?capture=9x16&cam=26500,6500,14200,23548,-68,12521&to=0,125000,60000,0,0,0&secs=12&select=01a1e745-e7a1-71d7-b41f-f8d4ed33ea26) | 12 s | starts on the Solar System, named and ringed, and pulls back until the whole Galaxy is in frame: a hook for the first seconds |
| [From the Sun to the centre](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day?capture=9x16&cam=26500,6500,14200,23548,-68,12521&to=31000,2600,16500,0,0,0&secs=10) | 10 s | lifts off the Sun's neighbourhood and swings round until the core rises over the disc, 26,670 light-years away, with our neighbours in the foreground |
| [Arriving at the Solar System](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day/view/01a1e745-e7a1-71d7-b41f-f8d4ed33ea26?capture=9x16&cam=-30,18,40,0,0,0&to=-5.267,4.557,3.613,0.75,0,-0.5&secs=10) | 10 s | from the outer planets' orbits in to the inner Solar System, ending on the home page's view |
| [The home page's view, turning](https://galaxyexplorer.perturbatory.com/u/milky-way/present-day/view/01a1e745-e7a1-71d7-b41f-f8d4ed33ea26?capture=9x16&cam=-5.267,4.557,3.613,0.75,0,-0.5&spin=45&secs=15&select=01a1e745-e7d5-7bdb-9869-4b92a7e8f229) | 15 s | the inner Solar System as the home page opens it, Earth selected, turning 45° |

Two cuts that join: **You are here** ends where **Into the heart** starts, and **Arriving at the Solar System** ends where **The home page's view, turning** starts.

## Notes

- **Poses** are `cam=px,py,pz,tx,ty,tz`: the camera's position and the point it looks at, in light-years in the galaxy view and system units in a system ([ux.md §9](../plan/ux.md#9-moving-between-views)). The Sun is at about (23548, −68, 12521) and Sagittarius A\* at the origin; galactic north is −Y, so these shots look down from the south (`scripts/content/README.md`).
- **The core is bright:** the closer to Sagittarius A\* the camera goes, the more the bulge's glow fills the frame. Into the heart stops 25,000 light-years out, low over the plane, where the bar and the bulge still read.
- **A 9:16 frame is narrow:** from far enough out to fit the whole disc across it, the camera is past the galaxy view's limit (three radii), so the disc shots crop its sides.
- **The ids** in the Solar System links and in `select` are production's. They differ in any other copy of the universe.
