# Experience backlog

## Gallery and navigation

**Built.** Show My AI Vocabulary and Search Filmstrip as cards with thumbnails. Selecting a card loads its HTML immediately in the gallery. A visible Gallery button returns to the cards. The URL fragment is a deep link, and browser Back and Forward restore the corresponding view. Only the selected exhibit is mounted.

## Two Heads

**Built.** The two gallery icons trade exported dialogue on a front-facing arcade stage. Each bubble types the speaker’s turn and scrolls to keep recent words visible. Pick a session, play or step through its turns, or click a turn in the transcript. Use the caption view for silent playback and the voice option when local browser voices are available.

The player includes ordinary and Design conversations with nonblank visible text. It presents the exported turns in time order within a session. It uses speaker roles to choose which figure animates. The two figures are fictional arcade characters. Text and dates come from the export, and speech uses synthetic voices.

## Session Rhythm

**Built.** Explore a weekday-by-hour heatmap, a calendar of starts, the distribution of starts per active day, and session lengths. London time is the default, with UTC available for comparison. Use the heatmap toggle to compare creation timestamps and recorded message timestamps. The length chart keeps message counts and first-to-last message spans as separate measures. Select a cell, date, or bar to see the underlying sessions.

The heatmap and categorical bars use established binned chart forms. The exhibit uses a flat view so the counts and time axes remain easy to read. [Observable Plot cells](https://observablehq.github.io/plot/marks/cell) · [Observable Plot bins](https://observablehq.github.io/plot/transforms/bin)

## My AI Vocabulary

**Built.** Lay down the three shared-color tiles for “your agent vocabulary,” hold for two seconds, then replay one complete session at a time in a 4:5 portrait frame with a 1080 × 1350 drawing surface. Shuffle is on by default and chooses from the remaining sessions. Turn it off to play the remaining sessions in chronological order.

The square tile board grows at three words per second by default. New tiles and repeats use distinct flashes in green for your words and red for Claude’s. The camera starts at the center, zooms out as the board grows, and then follows the active word. A distant word starts a pan and a bounded zoom-out. The camera stops once the tile is in view and gradually zooms in during a nearby run. It leads into upcoming tiles within the current session when their positions are close. The controls outside the portrait frame let you center and lock the camera, follow the latest word, wander, or zoom manually. The Camera speed slider controls Follow and Wander independently of the Word speed slider.

Record captures the portrait canvas live. Start from the opening or join playback already in progress. Pause & download ends the take and saves a silent portrait MP4 in browsers that support H.264 recording. WebM is available as a fallback.

## Search Filmstrip

**Built.** Capture public result pages in clean browser contexts and replay stored JPEGs in first-observed order. The first pass attempted 36 URLs and saved 30 images. Each frame retains its original URL, the result date, and the capture date. The standalone exhibit embeds its images. The viewer fills the viewport and can enter browser fullscreen.

## Vocabulary Constellation

**Next.** Render words as nodes and link words that appear in the same message. Color encodes the relative prevalence across the active comparison. Selecting a word highlights its strongest neighbors and shows the denominators and edge counts in an inspector. Start with a selectable seed word and a limited number of neighbors, then check whether a broader layout adds useful context.

Use the cleaned vocabulary rules from the original Atlas as a starting point. Compute within-message co-occurrence locally from the source export. Keep the existing aggregate overlap view available for exact comparisons.

## Later exhibits

- **Layered Vocabulary Atlas.** Align cohorts on separate planes and preserve a front-on comparison view.
- **Search Replay screening room.** Bring the selected result card forward and show its page in one live, restricted iframe.
- **Project solar system.** Orbit the known project documents and memories around their parent projects.
