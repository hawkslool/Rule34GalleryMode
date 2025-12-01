// ==UserScript==
// @name         Rule34 Gallery Mode
// @namespace    R34_Gallery_Mode
// @version      1.0
// @description  A clean, full-screen gallery viewer. Scroll to navigate, middle-click to open, artist metadata on hover.
// @author       hawkslool
// @match        https://rule34.xxx/index.php?page=post&s=list*
// @connect      api.rule34.xxx
// @connect      rule34.xxx
// @grant        GM_xmlhttpRequest
// @run-at       document-end
// @license MIT
// ==/UserScript==

(() => {
    'use strict';

    // --- CONFIGURATION ---
    const BUFFER_AHEAD = 3;
    const BUFFER_BEHIND = 1;
    const INTRO_VERSION = 'v1';
    const API_BASE = 'https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1';

    // --- STATE MANAGEMENT ---
    let postCache = new Map();
    let domList = [];
    let active = false;
    let currentIndex = 0;
    let ui = {};
    let preloadContainer = null;

    // --- INITIALIZATION ---
    const init = () => {
        const links = document.querySelectorAll('span.thumb a');
        if (links.length === 0) return;

        // 1. Map current page
        links.forEach((a, i) => {
            const id = a.id.replace('p', '');
            const img = a.querySelector('img');
            domList.push({
                index: i,
                id: id,
                thumbUrl: img ? img.src : '',
                viewUrl: a.href
            });
        });

        createButton();

        // Invisible buffer
        preloadContainer = document.createElement('div');
        preloadContainer.id = 'r34-gallery-buffer';
        preloadContainer.style = 'position:fixed;top:-9999px;left:-9999px;visibility:hidden;width:1px;height:1px;overflow:hidden;';
        document.body.appendChild(preloadContainer);

        // 2. Fetch API Data
        fetchApiData();

        // 3. Auto-start check (FIXED: Now matches correct button text)
        if (sessionStorage.getItem('r34_gallery_autostart') === 'true') {
            const checkReady = setInterval(() => {
                const btn = document.getElementById('r34-gallery-btn');
                // FIX: Check for "GALLERY MODE" instead of "READY"
                if (btn && btn.textContent.includes('GALLERY MODE')) {
                    clearInterval(checkReady);
                    sessionStorage.removeItem('r34_gallery_autostart');
                    startViewer();
                }
            }, 100);
        }
    };

    // --- API & SCRAPER ---
    const fetchApiData = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const tags = urlParams.get('tags') || '';
        const pid = urlParams.get('pid') || 0;
        const pageNum = Math.floor(pid / 42);

        const apiUrl = `${API_BASE}&limit=100&pid=${pageNum}&tags=${encodeURIComponent(tags)}`;

        GM_xmlhttpRequest({
            method: "GET",
            url: apiUrl,
            onload: (res) => {
                try {
                    const data = JSON.parse(res.responseText);
                    if (Array.isArray(data)) {
                        data.forEach(post => {
                            let displayUrl = post.file_url;
                            let originalUrl = post.file_url;
                            let type = 'image';

                            if (displayUrl.endsWith('.mp4') || displayUrl.endsWith('.webm')) {
                                type = 'video';
                            }

                            postCache.set(String(post.id), {
                                url: displayUrl,
                                originalUrl: originalUrl,
                                type: type,
                                source: 'API',
                                artists: null
                            });
                        });
                    }
                } catch (e) { console.warn('[Gallery] API Parse failed'); }
                updateButton(true);
            },
            onerror: () => updateButton(true)
        });
    };

    const scrapePost = (domItem, callback) => {
        if (domItem.scraping) return;
        domItem.scraping = true;

        GM_xmlhttpRequest({
            method: "GET",
            url: domItem.viewUrl,
            onload: (res) => {
                const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                let foundUrl = null;
                let type = 'image';

                const vid = doc.querySelector('#gelcomVideoPlayer source');
                if (vid) {
                    foundUrl = vid.src;
                    type = 'video';
                } else {
                    const originalLink = Array.from(doc.querySelectorAll('li > a')).find(a => a.textContent.includes('Original image'));
                    const img = doc.querySelector('#image');
                    if (originalLink) foundUrl = originalLink.href;
                    else if (img) foundUrl = img.src;
                }

                const artistLinks = Array.from(doc.querySelectorAll('li.tag-type-artist > a'))
                    .filter(a => !a.href.includes('page=wiki') && a.textContent !== '?');

                const artists = artistLinks.slice(0, 3).map(a => ({
                    name: a.textContent,
                    url: a.href
                }));

                if (foundUrl) {
                    const existing = postCache.get(domItem.id) || {};
                    postCache.set(domItem.id, {
                        ...existing,
                        url: foundUrl,
                        originalUrl: foundUrl,
                        type: type,
                        source: 'SCRAPER',
                        artists: artists
                    });

                    if (callback) callback(foundUrl, type, artists);
                }
                domItem.scraping = false;
            }
        });
    };

    // --- PRELOADER ---
    const updateBuffer = () => {
        const startIndex = Math.max(0, currentIndex - BUFFER_BEHIND);
        const endIndex = Math.min(domList.length - 1, currentIndex + BUFFER_AHEAD);

        const currentPreloads = Array.from(preloadContainer.children);
        currentPreloads.forEach(node => {
            const idx = parseInt(node.dataset.index);
            if (idx < startIndex || idx > endIndex) {
                if (node.tagName === 'VIDEO') {
                    node.pause();
                    node.src = "";
                    node.load();
                }
                node.remove();
            }
        });

        for (let i = startIndex; i <= endIndex; i++) {
            if (i === currentIndex) continue;
            if (preloadContainer.querySelector(`[data-index="${i}"]`)) continue;

            const domItem = domList[i];
            const cached = postCache.get(domItem.id);

            if (cached && cached.url) {
                spawnPreload(cached.url, cached.type, i);
                if (!cached.artists && !domItem.scraping) scrapePost(domItem, null);
            } else {
                scrapePost(domItem, (url, type, artists) => {
                    spawnPreload(url, type, i);
                });
            }
        }
    };

    const spawnPreload = (url, type, index) => {
        if (preloadContainer.querySelector(`[data-index="${index}"]`)) return;
        let el;
        if (type === 'video') {
            el = document.createElement('video');
            el.preload = 'auto';
            el.muted = true;
            el.src = url;
        } else {
            el = document.createElement('img');
            el.src = url;
        }
        el.dataset.index = index;
        el.style.width = '1px';
        el.style.height = '1px';
        preloadContainer.appendChild(el);
    };

    // --- UI MANAGER ---
    const createButton = () => {
        const btn = document.createElement('div');
        btn.id = 'r34-gallery-btn';
        btn.textContent = 'CONNECTING...';
        btn.style = `
            position: fixed; top: 10px; right: 10px;
            background: #000; color: #aa0; border: 4px solid #aa0;
            padding: 12px 24px; font: bold 18px 'Courier New', monospace;
            border-radius: 12px; cursor: wait; z-index: 999999;
            box-shadow: 0 0 15px #000; user-select: none; transition: 0.2s;
        `;
        document.body.appendChild(btn);
    };

    const updateButton = (ready) => {
        const btn = document.getElementById('r34-gallery-btn');
        if (!btn) return;
        if (ready) {
            btn.textContent = 'GALLERY MODE';
            btn.style.borderColor = '#0f0';
            btn.style.color = '#0f0';
            btn.style.cursor = 'pointer';
            btn.onclick = startViewer;
        }
    };

    const showFirstTimeIntro = (root) => {
        if (localStorage.getItem('r34_gallery_intro_seen') === INTRO_VERSION) return;

        const overlay = document.createElement('div');
        overlay.style = `
            position: absolute; inset: 0; background: rgba(0,0,0,0.85); z-index: 9999999999;
            display: flex; flex-direction: column; justify-content: center; align-items: center;
            color: #fff; font-family: sans-serif; text-align: center;
        `;

        overlay.innerHTML = `
            <div style="background:#222; border: 2px solid #0f0; border-radius: 15px; padding: 40px; max-width: 500px; box-shadow: 0 0 30px #0f0;">
                <h2 style="margin-top:0; color:#0f0; font-family:'Courier New', monospace;">WELCOME TO GALLERY MODE</h2>
                <div style="text-align:left; margin: 20px 0; font-size: 18px; line-height: 1.6;">
                    <p><strong>🖱 SCROLL / ARROWS:</strong> Navigate Up/Down</p>
                    <p><strong>🖱 MIDDLE CLICK:</strong> Open Full Res in New Tab</p>
                    <p><strong>❌ ESCAPE:</strong> Exit Gallery Mode</p>
                    <p><strong>🎨 ARTIST INFO:</strong> Displayed in Bottom Left</p>
                </div>
                <button id="r34-intro-close" style="
                    background: #0f0; color: #000; border: none; padding: 10px 30px;
                    font-size: 20px; font-weight: bold; cursor: pointer; border-radius: 5px;
                ">GOT IT</button>
            </div>
        `;

        root.appendChild(overlay);

        document.getElementById('r34-intro-close').onclick = () => {
            overlay.remove();
            localStorage.setItem('r34_gallery_intro_seen', INTRO_VERSION);
        };
    };

    // --- RENDERER ---
    const renderMedia = () => {
        if (!active) return;

        const domItem = domList[currentIndex];
        const { container, counter, artistPanel } = ui;

        if (counter) counter.textContent = `${currentIndex + 1} / ${domList.length}`;
        container.innerHTML = '';
        artistPanel.innerHTML = '';

        const cached = postCache.get(domItem.id);

        if (cached) {
            renderElement(cached.url, cached.type, container, domItem);
            renderArtists(cached.artists, artistPanel);
            if (!cached.artists) {
                scrapePost(domItem, (url, type, artists) => {
                    if (active && currentIndex === domItem.index) renderArtists(artists, artistPanel);
                });
            }
        } else {
            const loader = document.createElement('div');
            loader.innerHTML = 'LOADING FULL RES...<br><span style="font-size:16px;color:#666">(Fetching Original Source)</span>';
            loader.style = 'color:#0f0; font:bold 24px monospace; text-align:center;';
            container.appendChild(loader);

            scrapePost(domItem, (realUrl, realType, artists) => {
                if (active && currentIndex === domItem.index) {
                    container.innerHTML = '';
                    renderElement(realUrl, realType, container, domItem);
                    renderArtists(artists, artistPanel);
                }
            });
        }

        addNavZones(container);
        updateBuffer();
    };

    const renderArtists = (artists, panel) => {
        if (!artists || artists.length === 0) return;
        const header = document.createElement('div');
        header.textContent = 'Artist:';
        header.style = 'font-weight:bold; color:#ff69b4; margin-bottom:5px; text-shadow: 2px 2px 4px black; font-size: 24px;';
        panel.appendChild(header);

        artists.forEach(artist => {
            const a = document.createElement('a');
            a.textContent = artist.name;
            let href = artist.url;
            if (href.startsWith('/')) href = 'https://rule34.xxx' + href;
            a.href = href;
            a.target = '_blank';
            a.style = `display:block; color:#fff; text-decoration:none; font-weight:bold; margin-bottom:4px; text-shadow:2px 2px 0 #000; font-size:20px;`;
            a.onmouseover = () => a.style.textDecoration = 'underline';
            a.onmouseout = () => a.style.textDecoration = 'none';
            a.onclick = (e) => e.stopPropagation();
            a.onmousedown = (e) => e.stopPropagation();
            panel.appendChild(a);
        });
    };

    const renderElement = (url, type, container, domItem) => {
        if (type === 'video') {
            const vid = document.createElement('video');
            vid.src = url;
            vid.autoplay = true;
            vid.loop = true;
            vid.controls = true;
            vid.style = 'max-width:100vw;max-height:100vh;object-fit:contain;';
            container.appendChild(vid);
        } else {
            const img = document.createElement('img');
            img.src = url;
            img.style = 'max-width:100vw;max-height:100vh;object-fit:contain;';
            img.onerror = () => {
                scrapePost(domItem, (real, type, artists) => {
                    if (active && currentIndex === domItem.index) {
                        container.innerHTML = '';
                        renderElement(real, type, container, domItem);
                    }
                });
            };
            container.appendChild(img);
        }
    };

    const addNavZones = (container) => {
        const l = document.createElement('div'); l.style='position:absolute;left:0;top:0;width:20%;height:100%;cursor:w-resize;z-index:5;';
        l.onclick=(e)=>{e.stopPropagation();nav(-1);};
        const r = document.createElement('div'); r.style='position:absolute;right:0;top:0;width:80%;height:100%;cursor:e-resize;z-index:5;';
        r.onclick=(e)=>{e.stopPropagation();nav(1);};
        container.appendChild(l); container.appendChild(r);
    };

    // --- NAVIGATION ---
    const nav = (dir) => {
        const nextIndex = currentIndex + dir;
        if (nextIndex >= domList.length) {
            const nextBtn = document.querySelector('a[alt="next"]');
            if (nextBtn) {
                ui.container.innerHTML = '';
                const msg = document.createElement('div');
                msg.textContent = 'JUMPING TO NEXT PAGE >>';
                msg.style = 'color:#0f0;font:bold 40px monospace;background:#000;padding:20px;';
                ui.container.appendChild(msg);
                sessionStorage.setItem('r34_gallery_autostart', 'true');
                window.location.href = nextBtn.href;
            } else alert("End of results.");
            return;
        }
        currentIndex = (nextIndex < 0) ? domList.length - 1 : nextIndex;
        renderMedia();
    };

    // --- VIEWER OVERLAY ---
    const startViewer = () => {
        if (active) return;
        active = true;
        document.body.style.overflow = 'hidden';

        const d = document.createElement('div');
        d.style = 'position:fixed;inset:0;background:#000;z-index:999999999;display:flex;justify-content:center;align-items:center;';
        d.tabIndex = 0;

        const container = document.createElement('div');
        container.style = 'width:100%;height:100%;display:flex;justify-content:center;align-items:center;position:relative;';
        d.appendChild(container);

        const counter = document.createElement('div');
        counter.style = 'position:absolute;bottom:30px;right:30px;color:#fff;font:bold 30px monospace;text-shadow:2px 2px 0 #000;pointer-events:none;z-index:10;';
        d.appendChild(counter);

        const artistPanel = document.createElement('div');
        artistPanel.style = 'position:absolute; bottom:20px; left:20px; z-index:20; font-family:sans-serif; pointer-events:auto; text-align:left;';
        d.appendChild(artistPanel);

        const close = document.createElement('div');
        close.textContent = '×';
        close.style = 'position:absolute;top:0;left:0;color:#fff;font:bold 60px monospace;padding:0 30px;cursor:pointer;z-index:30;text-shadow:0 0 10px #000; opacity:0; transition:opacity 0.2s;';
        close.onmouseover = () => close.style.opacity = '1';
        close.onmouseout = () => close.style.opacity = '0';
        close.onclick = stopViewer;
        d.appendChild(close);

        const openCurrentImg = () => {
            const cached = postCache.get(domList[currentIndex].id);
            const urlToOpen = cached ? (cached.originalUrl || cached.url) : domList[currentIndex].viewUrl;
            window.open(urlToOpen, '_blank');
        };

        const openImg = document.createElement('div');
        openImg.textContent = 'OPEN IMG ↗';
        openImg.style = 'position:absolute;top:20px;right:20px;color:#0f0;font:bold 24px monospace;padding:10px 20px;cursor:pointer;z-index:20;border:2px solid #0f0;border-radius:8px;background:rgba(0,0,0,0.5);';
        openImg.onclick = (e) => { e.stopPropagation(); openCurrentImg(); };
        d.appendChild(openImg);

        const viewPost = document.createElement('div');
        viewPost.textContent = 'VIEW POST ↗';
        viewPost.style = 'position:absolute;top:80px;right:20px;color:#fff;font:bold 18px monospace;padding:8px 16px;cursor:pointer;z-index:20;border:2px solid #fff;border-radius:8px;background:rgba(0,0,0,0.5);';
        viewPost.onclick = (e) => { e.stopPropagation(); window.open(domList[currentIndex].viewUrl, '_blank'); };
        d.appendChild(viewPost);

        ui = { root: d, container, counter, artistPanel };
        document.body.appendChild(d);
        d.focus();

        // --- INPUT EVENTS ---
        d.onkeydown = (e) => {
            if (e.key === 'Escape') stopViewer();
            if (['ArrowDown'].includes(e.key)) nav(1);
            if (['ArrowUp'].includes(e.key)) nav(-1);
        };

        let scrollLock = false;
        d.onwheel = (e) => {
            e.preventDefault();
            if (scrollLock) return;
            scrollLock = true;
            setTimeout(() => scrollLock = false, 150);
            if (e.deltaY > 0) nav(1);
            else if (e.deltaY < 0) nav(-1);
        };

        d.onmousedown = (e) => {
            if (e.button === 1) { e.preventDefault(); e.stopPropagation(); openCurrentImg(); }
        };

        // --- INTRO CHECK ---
        showFirstTimeIntro(d);

        renderMedia();
    };

    const stopViewer = () => {
        active = false;
        document.body.style.overflow = '';
        if (ui.root) ui.root.remove();
        sessionStorage.removeItem('r34_gallery_autostart');
    };

    init();
})();
