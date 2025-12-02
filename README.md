# Rule34 Gallery Mode

A clean, immersive, full-screen gallery viewer for Rule34. Turns the standard pagination into a seamless scrolling feed.
Note! This script is UAYOR. You may be rate limited or blocked from using Rule34 services.
Currently only tested using Firefox & Violentmonkey, please let me know if you encounter any issues by making a post in [Issues](https://github.com/hawkslool/Rule34GalleryMode/issues).

## Features
* **Immersive View:** Removes sidebar, ads, and clutter.
* **Full Resolution Only:** Automatically fetches the highest quality source (image or video).
* **Smart Preloader:** Buffers the next 3 images in the background for instant navigation.
* **Artist Metadata:** Displays the artist name in the bottom-left corner.
* **Infinite Scroll:** Automatically jumps to the next page when you reach the end of the current list.

## Installation
1.  Install [Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/).
2.  [**Click here to Install the Script**](https://github.com/hawkslool/Rule34GalleryMode/raw/refs/heads/main/rule34-gallery-mode.user.js)

## Controls
* **Scroll / Arrow Down:** Next Image
* **Arrow Up:** Previous Image
* **Middle Click:** Open current image in new tab
* **Escape:** Exit Gallery Mode

## Changelogs
12/02: 
- Gallery load will only be initiated when clicking (Gallery Mode) instead of automatically on each page load
- Add detailed breakdown (and retry) on "loading preview" states
- Delay page flipper by 3 seconds, interruptible by any key press
- Add option to use your own API key for possible increased rate limits
- (1.21) Hot-fixed auto page jump not respecting cancellation


## Previews

**First time install + General controls:**

https://github.com/user-attachments/assets/b63faaa4-f3fe-43ad-91f7-6298de4d642b

---

**Page flip + Auto-gallery continuation:**

https://github.com/user-attachments/assets/ee4625dc-21db-4162-971e-3335ed3870ae

---

*vibe coded using grok (base) and gemini (majority)*
