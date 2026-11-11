(function() {
    'use strict';

    const STORAGE_KEY = 'sugarhill-playlists-v1';
    const PLAYLIST_QUERY_PARAM = 'playlist';
    const PLAYLIST_ITEM_QUERY_PARAM = 'playlistItem';
    function getNotificationDurationMs() {
        if (window.SugarHillSettings && typeof window.SugarHillSettings.get === 'function') {
            const value = Number(window.SugarHillSettings.get('playlists.notificationDurationMs', 10000));
            return Number.isFinite(value) && value > 0 ? value : 10000;
        }
        return 10000;
    }

    function writePlaylists(playlists) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(playlists));
    }

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `playlist-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function getNotificationStack() {
        let stack = document.querySelector('.floating-status-stack');
        if (stack) return stack;

        stack = document.createElement('div');
        stack.className = 'floating-status-stack';
        stack.setAttribute('aria-live', 'polite');
        stack.setAttribute('aria-atomic', 'false');
        document.body.appendChild(stack);
        return stack;
    }

    function notificationTypeForMessage(message) {
        const text = String(message || '').trim();
        if (
            !text ||
            text.startsWith('Added') ||
            text.startsWith('Created') ||
            text.startsWith('Deleted') ||
            text.startsWith('Duplicated') ||
            text.startsWith('Exported') ||
            text.startsWith('Exporting') ||
            text.startsWith('Moved')
        ) {
            return 'success';
        }
        return 'error';
    }

    function showStatusMessage(message) {
        const text = String(message || '').trim();
        if (!text) return;

        const banner = document.createElement('button');
        banner.type = 'button';
        banner.className = `floating-status-banner is-${notificationTypeForMessage(text)}`;
        banner.textContent = text;

        let dismissTimeout = null;
        function dismiss() {
            if (dismissTimeout) {
                window.clearTimeout(dismissTimeout);
                dismissTimeout = null;
            }
            banner.classList.add('is-exiting');
            banner.addEventListener('transitionend', () => banner.remove(), { once: true });
            window.setTimeout(() => banner.remove(), 350);
        }

        banner.addEventListener('click', dismiss);
        getNotificationStack().appendChild(banner);
        window.requestAnimationFrame(() => banner.classList.add('is-visible'));
        dismissTimeout = window.setTimeout(dismiss, getNotificationDurationMs());
    }

    function createPreviewAttrs(previewSprite) {
        if (!previewSprite || !previewSprite.src) return '';
        return [
            `data-preview-src="${escapeHtml(previewSprite.src)}"`,
            `data-preview-frame-count="${Number(previewSprite.frame_count) || 0}"`,
            `data-preview-frame-width="${Number(previewSprite.frame_width) || 0}"`,
            `data-preview-frame-height="${Number(previewSprite.frame_height) || 0}"`,
            `data-preview-columns="${Number(previewSprite.columns) || 0}"`
        ].join(' ').replace(/^/, ' ');
    }

    function formatDuration(seconds) {
        const total = Number(seconds) || 0;
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = Math.floor(total % 60);
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function getCurrentPageUrl() {
        const path = window.location.pathname || '';
        return path.split('/').pop();
    }

    function normalizePlaylistName(name) {
        return String(name || '').trim();
    }

    function isWatchQueuePlaylist(playlist) {
        return normalizePlaylistName(playlist && playlist.name).toLowerCase() === 'watch queue';
    }

    function playlistsForPageDisplay(playlists) {
        const ordered = Array.isArray(playlists) ? playlists.slice() : [];
        ordered.sort((left, right) => {
            const leftIsWatchQueue = isWatchQueuePlaylist(left);
            const rightIsWatchQueue = isWatchQueuePlaylist(right);
            if (leftIsWatchQueue === rightIsWatchQueue) return 0;
            return leftIsWatchQueue ? -1 : 1;
        });
        return ordered;
    }

    function toPlaylistAnchor(name) {
        const base = normalizePlaylistName(name).toLowerCase();
        const slug = base
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
        return `playlist-${slug || 'untitled'}`;
    }

    function decodePlaylistRef(ref) {
        try {
            return decodeURIComponent(ref || '');
        } catch (error) {
            return ref || '';
        }
    }

    function getUniquePlaylistName(baseName, playlists) {
        const candidateBase = normalizePlaylistName(baseName) || 'Untitled playlist';
        let candidate = candidateBase;
        let index = 2;
        while (playlists.some(playlist => playlist.name === candidate)) {
            candidate = `${candidateBase} (${index})`;
            index += 1;
        }
        return candidate;
    }

    function cloneVideo(video) {
        return {
            id: video.id || video.url,
            playlistItemId: video.playlistItemId || createId(),
            title: video.title || 'Untitled video',
            show: video.show || '',
            url: video.url || '',
            mediaSrc: video.mediaSrc || '',
            duration: Number(video.duration) || 0,
            thumbnail: video.thumbnail || '',
            previewSprite: video.previewSprite || null
        };
    }

    function normalizePlaylists(playlists) {
        let changed = false;
        const normalized = playlists.map(playlist => {
            const sourceVideos = Array.isArray(playlist.videos) ? playlist.videos : [];
            const videos = sourceVideos.map(video => {
                const nextVideo = cloneVideo(video);
                if (
                    nextVideo.playlistItemId !== video.playlistItemId ||
                    nextVideo.mediaSrc !== (video.mediaSrc || '')
                ) {
                    changed = true;
                }
                return nextVideo;
            });

            if (!Array.isArray(playlist.videos)) {
                changed = true;
            }

            return Object.assign({}, playlist, { videos });
        });

        return { playlists: normalized, changed };
    }

    function readPlaylists() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            const parsed = stored ? JSON.parse(stored) : [];
            const playlists = Array.isArray(parsed) ? parsed : [];
            const normalized = normalizePlaylists(playlists);
            if (normalized.changed) {
                writePlaylists(normalized.playlists);
            }
            return normalized.playlists;
        } catch (error) {
            console.warn('Error reading playlists:', error);
            return [];
        }
    }

    function readPlaylistById(playlistId) {
        return readPlaylists().find(playlist => playlist.id === playlistId) || null;
    }

    function importConfiguredPlaylists() {
        const imported = Array.isArray(window.SUGARHILL_IMPORTED_PLAYLISTS)
            ? window.SUGARHILL_IMPORTED_PLAYLISTS
            : [];
        if (imported.length === 0) return;

        const existing = readPlaylists();
        let changed = false;
        imported.forEach(playlist => {
            if (!playlist || !playlist.id || existing.some(item => item.id === playlist.id)) {
                return;
            }
            const videos = Array.isArray(playlist.videos) ? playlist.videos.map(cloneVideo) : [];
            existing.push(Object.assign({}, playlist, { videos }));
            changed = true;
        });
        if (changed) {
            writePlaylists(existing);
        }
    }

    function getPlaylistByReference(reference) {
        const playlists = readPlaylists();
        const decoded = decodePlaylistRef(reference);
        if (!decoded) return null;
        return playlists.find(playlist => playlist.name === decoded)
            || playlists.find(playlist => playlist.id === decoded)
            || null;
    }

    function withPlaylistVideoQuery(videoUrl, playlistName, playlistItemId) {
        if (!videoUrl || !playlistName) return videoUrl || '';
        const url = new URL(videoUrl, window.location.href);
        url.searchParams.set(PLAYLIST_QUERY_PARAM, playlistName);
        if (playlistItemId) {
            url.searchParams.set(PLAYLIST_ITEM_QUERY_PARAM, playlistItemId);
        }
        return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
    }

    function getPlaylistRefFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get(PLAYLIST_QUERY_PARAM) || '';
    }

    function getPlaylistItemIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get(PLAYLIST_ITEM_QUERY_PARAM) || '';
    }

    function getCurrentPlaylistContext() {
        const playlistRef = getPlaylistRefFromUrl();
        if (!playlistRef) return null;

        const playlist = getPlaylistByReference(playlistRef);
        if (!playlist || !Array.isArray(playlist.videos) || playlist.videos.length === 0) {
            return null;
        }

        const currentUrl = getCurrentPageUrl();
        const playlistItemId = getPlaylistItemIdFromUrl();
        const index = playlistItemId
            ? playlist.videos.findIndex(video => video.playlistItemId === playlistItemId)
            : playlist.videos.findIndex(video => video.url === currentUrl);
        if (index === -1) return null;

        return {
            playlist,
            playlistRef: playlist.name,
            currentIndex: index,
            previous: index > 0 ? playlist.videos[index - 1] : null,
            next: index < playlist.videos.length - 1 ? playlist.videos[index + 1] : null
        };
    }

    function currentVideoFromPanel(panel) {
        return {
            id: panel.dataset.videoId || panel.dataset.videoUrl,
            title: panel.dataset.videoTitle || 'Untitled video',
            show: panel.dataset.videoShow || '',
            url: panel.dataset.videoUrl || getCurrentPageUrl(),
            mediaSrc: panel.dataset.videoSrc || '',
            duration: Number(panel.dataset.videoDuration) || 0,
            thumbnail: panel.dataset.videoThumbnail || '',
            previewSprite: panel.dataset.videoPreviewSprite ? {
                src: panel.dataset.videoPreviewSprite,
                frame_count: Number(panel.dataset.videoPreviewFrameCount) || 0,
                frame_width: Number(panel.dataset.videoPreviewFrameWidth) || 0,
                frame_height: Number(panel.dataset.videoPreviewFrameHeight) || 0,
                columns: Number(panel.dataset.videoPreviewColumns) || 0
            } : null
        };
    }

    function touchPlaylist(playlist) {
        playlist.updatedAt = new Date().toISOString();
    }

    function addVideoToPlaylist(playlistId, video) {
        const playlists = readPlaylists();
        const playlist = playlists.find(item => item.id === playlistId);
        if (!playlist) return 'Select a playlist first.';

        playlist.videos = Array.isArray(playlist.videos) ? playlist.videos : [];
        playlist.videos.push(cloneVideo(video));
        touchPlaylist(playlist);
        writePlaylists(playlists);
        return `Added to "${playlist.name}".`;
    }

    function createPlaylist(name, video) {
        const trimmedName = normalizePlaylistName(name);
        if (!trimmedName) return 'Name the new playlist first.';
        const existing = readPlaylists();
        const uniqueName = getUniquePlaylistName(trimmedName, existing);
        if (uniqueName !== trimmedName) {
            return `A playlist named "${trimmedName}" already exists.`;
        }

        const now = new Date().toISOString();
        const playlist = {
            id: createId(),
            name: uniqueName,
            createdAt: now,
            updatedAt: now,
            videos: video ? [cloneVideo(video)] : []
        };

        existing.push(playlist);
        writePlaylists(existing);
        return `Created "${uniqueName}".`;
    }

    function duplicatePlaylist(playlistId) {
        const playlists = readPlaylists();
        const source = playlists.find(playlist => playlist.id === playlistId);
        if (!source) return 'Playlist not found.';
        const duplicateName = getUniquePlaylistName(`${source.name} Copy`, playlists);

        const now = new Date().toISOString();
        const duplicate = {
            id: createId(),
            name: duplicateName,
            createdAt: now,
            updatedAt: now,
            videos: Array.isArray(source.videos) ? source.videos.map(cloneVideo) : []
        };

        playlists.push(duplicate);
        writePlaylists(playlists);
        return `Duplicated "${source.name}".`;
    }

    function deletePlaylist(playlistId) {
        const playlists = readPlaylists();
        const playlist = playlists.find(item => item.id === playlistId);
        if (!playlist) return 'Playlist not found.';

        writePlaylists(playlists.filter(item => item.id !== playlistId));
        return `Deleted "${playlist.name}".`;
    }

    function enrichedVideo(video) {
        const videosIndex = window.VIDEOS_INDEX && Array.isArray(window.VIDEOS_INDEX.videos)
            ? window.VIDEOS_INDEX.videos
            : [];
        const match = videosIndex.find(item => item.id === video.id || item.url === video.url);
        const merged = Object.assign({}, match || {}, video);
        merged.mediaSrc = video.mediaSrc || (match && match.mediaSrc) || '';
        merged.previewSprite = video.previewSprite || (match && match.previewSprite) || null;
        return merged;
    }

    async function resolveVideoMediaSrc(video) {
        if (video.mediaSrc) {
            return new URL(video.mediaSrc, window.location.href).href;
        }

        const enriched = enrichedVideo(video);
        if (enriched.mediaSrc) {
            return new URL(enriched.mediaSrc, window.location.href).href;
        }

        if (!video.url) return '';

        try {
            const response = await fetch(video.url, { credentials: 'same-origin' });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const html = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const source = doc.querySelector('video source[src]');
            const src = source ? source.getAttribute('src') || '' : '';
            return src ? new URL(src, new URL(video.url, window.location.href)).href : '';
        } catch (error) {
            console.warn(`Unable to resolve media source for ${video.url}:`, error);
            return '';
        }
    }

    async function buildXspf(playlist) {
        const videos = Array.isArray(playlist.videos) ? playlist.videos.map(enrichedVideo) : [];
        const escapeXml = value => String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        const tracks = await Promise.all(videos.map(async (video, index) => {
            const location = await resolveVideoMediaSrc(video);
            if (!location) {
                throw new Error(`Could not resolve media source for "${video.title || video.url || `track ${index + 1}`}".`);
            }
            const durationMs = Math.max(0, Math.round((Number(video.duration) || 0) * 1000));
            return [
                '    <track>',
                `      <location>${escapeXml(location)}</location>`,
                `      <title>${escapeXml(video.title || 'Untitled video')}</title>`,
                `      <creator>${escapeXml(video.show || 'Sugarhill')}</creator>`,
                video.thumbnail ? `      <image>${escapeXml(new URL(video.thumbnail, window.location.href).href)}</image>` : '',
                `      <duration>${durationMs}</duration>`,
                `      <trackNum>${index + 1}</trackNum>`,
                '    </track>'
            ].filter(Boolean).join('\n');
        }));

        return [
            '<?xml version="1.0" encoding="UTF-8"?>',
            '<playlist version="1" xmlns="http://xspf.org/ns/0/">',
            `  <title>${escapeXml(playlist.name || 'Playlist')}</title>`,
            '  <trackList>',
            tracks.join('\n'),
            '  </trackList>',
            '</playlist>'
        ].join('\n');
    }

    async function downloadPlaylistXspf(playlistId) {
        const playlist = readPlaylistById(playlistId);
        if (!playlist) return 'Playlist not found.';

        let xspf;
        try {
            xspf = await buildXspf(playlist);
        } catch (error) {
            return `Export failed: ${error instanceof Error ? error.message : 'Unable to resolve source URLs.'}`;
        }

        const blob = new Blob([xspf], { type: 'application/xspf+xml;charset=utf-8' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safeName = (playlist.name || 'playlist').replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'playlist';
        link.href = objectUrl;
        link.download = `${safeName}.xspf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        return `Exported "${playlist.name}".`;
    }

    function playPlaylist(playlistId) {
        const playlist = readPlaylistById(playlistId);
        if (!playlist || !Array.isArray(playlist.videos) || playlist.videos.length === 0) {
            return 'Add at least one video before playing this playlist.';
        }

        const firstVideo = playlist.videos[0];
        window.location.href = withPlaylistVideoQuery(firstVideo.url, playlist.name, firstVideo.playlistItemId);
        return '';
    }

    function moveVideoBetweenPlaylists(sourcePlaylistId, sourceIndex, targetPlaylistId, targetIndex) {
        const playlists = readPlaylists();
        const sourcePlaylist = playlists.find(playlist => playlist.id === sourcePlaylistId);
        const targetPlaylist = playlists.find(playlist => playlist.id === targetPlaylistId);
        if (!sourcePlaylist || !targetPlaylist) return 'Playlist not found.';

        sourcePlaylist.videos = Array.isArray(sourcePlaylist.videos) ? sourcePlaylist.videos : [];
        targetPlaylist.videos = Array.isArray(targetPlaylist.videos) ? targetPlaylist.videos : [];

        if (sourceIndex < 0 || sourceIndex >= sourcePlaylist.videos.length) {
            return 'Video not found.';
        }

        const [movedVideo] = sourcePlaylist.videos.splice(sourceIndex, 1);
        if (!movedVideo) return 'Video not found.';

        let insertionIndex = Number.isInteger(targetIndex) ? targetIndex : targetPlaylist.videos.length;
        if (sourcePlaylistId === targetPlaylistId && sourceIndex < insertionIndex) {
            insertionIndex -= 1;
        }

        insertionIndex = Math.max(0, Math.min(insertionIndex, targetPlaylist.videos.length));
        targetPlaylist.videos.splice(insertionIndex, 0, movedVideo);
        touchPlaylist(sourcePlaylist);
        if (sourcePlaylist !== targetPlaylist) {
            touchPlaylist(targetPlaylist);
        }
        writePlaylists(playlists);
        return `Moved "${movedVideo.title}" to "${targetPlaylist.name}".`;
    }

    function renderWatchControls() {
        const panel = document.querySelector('.playlist-panel');
        if (!panel) return;

        const toggleButton = panel.querySelector('.playlist-toggle-button');
        const modal = panel.querySelector('.playlist-modal');
        const copyUrlButton = panel.querySelector('.copy-url-button');
        const select = panel.querySelector('.playlist-select');
        const addButton = panel.querySelector('.playlist-add-button');
        const createLaunchButton = panel.querySelector('.playlist-create-launch-button');
        const createOverlay = panel.querySelector('.playlist-create-overlay');
        const createInput = panel.querySelector('.playlist-create-input');
        const createConfirmButton = panel.querySelector('.playlist-create-confirm-button');
        const createCancelButton = panel.querySelector('.playlist-create-cancel-button');
        const video = currentVideoFromPanel(panel);

        function setStatus(message) {
            showStatusMessage(message);
        }

        function closeModal() {
            if (!modal || !toggleButton) return;
            modal.hidden = true;
            toggleButton.setAttribute('aria-expanded', 'false');
        }

        function openModal() {
            if (!modal || !toggleButton) return;
            modal.hidden = false;
            toggleButton.setAttribute('aria-expanded', 'true');
        }

        function toggleModal() {
            if (!modal || !toggleButton) return;
            if (modal.hidden) {
                openModal();
            } else {
                closeModal();
            }
        }

        function openCreateOverlay() {
            if (!createOverlay) return;
            createOverlay.hidden = false;
            if (createInput) createInput.focus();
        }

        function closeCreateOverlay() {
            if (!createOverlay) return;
            createOverlay.hidden = true;
            if (createInput) createInput.value = '';
        }

        function populateOptions() {
            const playlists = readPlaylists();
            select.innerHTML = '<option value="">Select playlist</option>';
            playlists.forEach(playlist => {
                const option = document.createElement('option');
                option.value = playlist.id;
                option.textContent = `${playlist.name} (${(playlist.videos || []).length})`;
                select.appendChild(option);
            });
            addButton.disabled = playlists.length === 0;
        }

        addButton.addEventListener('click', () => {
            setStatus(addVideoToPlaylist(select.value, video));
            populateOptions();
        });

        if (toggleButton && modal) {
            toggleButton.addEventListener('click', toggleModal);
            document.addEventListener('click', event => {
                const target = event.target;
                if (!(target instanceof Element)) return;
                if (toggleButton.contains(target) || modal.contains(target)) return;
                closeModal();
            });
            document.addEventListener('keydown', event => {
                if (event.key === 'Escape') {
                    closeModal();
                    closeCreateOverlay();
                }
            });
        }

        if (createLaunchButton) {
            createLaunchButton.addEventListener('click', () => {
                closeModal();
                openCreateOverlay();
            });
        }

        if (createCancelButton) {
            createCancelButton.addEventListener('click', closeCreateOverlay);
        }

        if (createOverlay) {
            createOverlay.addEventListener('click', event => {
                if (event.target === createOverlay) {
                    closeCreateOverlay();
                }
            });
        }

        if (createConfirmButton) {
            createConfirmButton.addEventListener('click', () => {
                const message = createPlaylist(createInput.value, video);
                setStatus(message);
                populateOptions();
                if (message.startsWith('Created')) {
                    closeCreateOverlay();
                }
            });
        }

        if (createInput && createConfirmButton) {
            createInput.addEventListener('keydown', event => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    createConfirmButton.click();
                }
            });
        }

        if (copyUrlButton) {
            copyUrlButton.addEventListener('click', async () => {
                const originalText = 'Copy URL';
                const copiedText = 'Copied \u2705';
                const url = window.location.href;
                try {
                    await navigator.clipboard.writeText(url);
                } catch (error) {
                    const fallback = document.createElement('textarea');
                    fallback.value = url;
                    fallback.style.position = 'fixed';
                    fallback.style.opacity = '0';
                    document.body.appendChild(fallback);
                    fallback.select();
                    document.execCommand('copy');
                    document.body.removeChild(fallback);
                }

                copyUrlButton.textContent = copiedText;
                copyUrlButton.classList.add('copied');
                window.setTimeout(() => {
                    copyUrlButton.classList.remove('copied');
                    copyUrlButton.textContent = originalText;
                }, 2000);
            });
        }

        closeModal();
        closeCreateOverlay();
        populateOptions();
    }

    function createSidebarSection(label, video) {
        if (!video) return null;
        const enriched = enrichedVideo(video);

        const section = document.createElement('div');
        section.className = 'sidebar-section playlist-sidebar-section';
        section.dataset.playlistManaged = 'true';

        const sectionLabel = document.createElement('div');
        sectionLabel.className = 'sidebar-label';
        sectionLabel.textContent = label;

        const link = document.createElement('a');
        link.className = 'video-item';
        const context = getCurrentPlaylistContext();
        link.href = withPlaylistVideoQuery(enriched.url, context ? context.playlist.name : '', enriched.playlistItemId);
        const duration = formatDuration(enriched.duration);
        const badge = enriched.resolution_badge;

        if (enriched.thumbnail) {
            const thumbWrap = document.createElement('div');
            thumbWrap.className = 'video-item-thumbnail-container';
            if (enriched.previewSprite && enriched.previewSprite.src) {
                thumbWrap.dataset.previewSrc = enriched.previewSprite.src;
                thumbWrap.dataset.previewFrameCount = String(Number(enriched.previewSprite.frame_count) || 0);
                thumbWrap.dataset.previewFrameWidth = String(Number(enriched.previewSprite.frame_width) || 0);
                thumbWrap.dataset.previewFrameHeight = String(Number(enriched.previewSprite.frame_height) || 0);
                thumbWrap.dataset.previewColumns = String(Number(enriched.previewSprite.columns) || 0);
            }

            const img = document.createElement('img');
            img.className = 'video-item-thumbnail';
            img.alt = 'Thumbnail';
            img.src = enriched.thumbnail;

            const overlay = document.createElement('div');
            overlay.className = 'video-item-thumbnail-overlay';
            overlay.dataset.duration = duration;
            overlay.dataset.durationSeconds = String(Number(enriched.duration) || 0);

            const durationEl = document.createElement('div');
            durationEl.className = 'video-item-duration';
            durationEl.textContent = duration;

            thumbWrap.appendChild(img);
            thumbWrap.appendChild(overlay);
            thumbWrap.appendChild(durationEl);
            link.appendChild(thumbWrap);
        }

        const content = document.createElement('div');
        content.className = 'video-item-content';

        const title = document.createElement('div');
        title.className = 'video-item-title';
        title.textContent = enriched.title || 'Untitled video';
        content.appendChild(title);

        if (badge && badge.label && badge.color) {
            const badgeBar = document.createElement('div');
            badgeBar.className = 'video-item-badge-bar';
            const badgeEl = document.createElement('span');
            badgeEl.className = badge.light_text === false
                ? 'video-item-badge video-item-badge--dark-text'
                : 'video-item-badge';
            if (window.SugarHillSettings && typeof window.SugarHillSettings.applyBadgeElement === 'function') {
                window.SugarHillSettings.applyBadgeElement(badgeEl, badge.color);
            } else {
                badgeEl.style.backgroundColor = badge.color;
            }
            badgeEl.textContent = badge.label;
            badgeBar.appendChild(badgeEl);
            content.appendChild(badgeBar);
        }

        link.appendChild(content);
        section.appendChild(sectionLabel);
        section.appendChild(link);
        return section;
    }

    function createPlaylistContextSection(context) {
        if (!context || !context.playlist) return null;

        const section = document.createElement('div');
        section.className = 'sidebar-section playlist-sidebar-section';
        section.dataset.playlistManaged = 'true';

        const row = document.createElement('div');
        row.className = 'sidebar-label playlist-now-playing-row';

        const label = document.createElement('span');
        label.textContent = 'NOW PLAYING:';

        const link = document.createElement('a');
        link.className = 'playlist-now-playing-link';
        link.href = `playlists.html#${encodeURIComponent(toPlaylistAnchor(context.playlist.name))}`;
        link.textContent = context.playlist.name || 'Untitled playlist';

        row.appendChild(label);
        row.appendChild(link);
        section.appendChild(row);
        return section;
    }

    function removeManagedSidebarSections(sidebar) {
        sidebar.querySelectorAll('[data-playlist-managed="true"]').forEach(section => section.remove());
        sidebar.querySelectorAll('.sidebar-section').forEach(section => {
            const label = section.querySelector('.sidebar-label');
            if (!label) return;
            const text = label.textContent.trim();
            if (text === 'Next' || text === 'Previous') {
                section.remove();
            }
        });
    }

    function applyPlaylistSidebar(context) {
        const sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        removeManagedSidebarSections(sidebar);

        const recommended = sidebar.querySelector('.sidebar-section');
        const insertBefore = recommended || null;
        const playlistSection = createPlaylistContextSection(context);
        const nextSection = createSidebarSection('Next', context.next);
        const previousSection = createSidebarSection('Previous', context.previous);

        if (playlistSection) {
            sidebar.insertBefore(playlistSection, insertBefore);
        }
        if (nextSection) {
            sidebar.insertBefore(nextSection, insertBefore);
        }
        if (previousSection) {
            sidebar.insertBefore(previousSection, insertBefore);
        }
    }

    function applyPlaylistVideoOverrides(context) {
        const videoElement = document.querySelector('video');
        if (!videoElement) return;

        if (context.next) {
            videoElement.setAttribute('data-next-url', withPlaylistVideoQuery(context.next.url, context.playlistRef, context.next.playlistItemId));
            videoElement.setAttribute('data-next-title', context.next.title || '');
        } else {
            videoElement.setAttribute('data-next-url', '');
            videoElement.setAttribute('data-next-title', '');
        }
    }

    function renderPlaylistPage() {
        const container = document.getElementById('playlist-list');
        const empty = document.getElementById('playlists-empty');
        if (!container) return;

        const playlists = playlistsForPageDisplay(readPlaylists());
        empty.hidden = playlists.length > 0;

        container.innerHTML = playlists.map(playlist => {
            const videos = Array.isArray(playlist.videos) ? playlist.videos.map(enrichedVideo) : [];
            const videoHtml = videos.map((video, index) => `
                <article
                    class="playlist-video-card"
                    draggable="true"
                    data-playlist-id="${escapeHtml(playlist.id)}"
                    data-video-index="${index}"
                    data-video-url="${escapeHtml(video.url)}"
                >
                    <div class="playlist-video-thumbnail-wrap"${createPreviewAttrs(video.previewSprite)}>
                        <div class="playlist-video-drag-handle" aria-hidden="true" title="Drag to reorder or move">&#8942;&#8942;</div>
                        ${video.thumbnail ? `<img src="${escapeHtml(video.thumbnail)}" alt="Thumbnail" class="playlist-video-thumbnail">` : ''}
                        <span class="playlist-video-duration">${formatDuration(video.duration)}</span>
                    </div>
                    <div class="playlist-video-content">
                        <div class="playlist-video-title">${escapeHtml(video.title)}</div>
                        <div class="playlist-video-show">${escapeHtml(video.show)}</div>
                    </div>
                </article>
            `).join('');

            return `
                <section id="${escapeHtml(toPlaylistAnchor(playlist.name))}" class="playlist-card" data-playlist-id="${escapeHtml(playlist.id)}">
                    <div class="playlist-card-header">
                        <div class="playlist-card-heading">
                            <h2 class="playlist-card-title">${escapeHtml(playlist.name)}</h2>
                            <div class="playlist-card-count">${videos.length} video${videos.length === 1 ? '' : 's'}</div>
                        </div>
                        <div class="playlist-card-actions">
                            <button type="button" class="playlist-play-all-button" data-playlist-id="${escapeHtml(playlist.id)}">Play All</button>
                            <button type="button" class="playlist-export-button" data-playlist-id="${escapeHtml(playlist.id)}">Export XSPF</button>
                            <button type="button" class="playlist-duplicate-button" data-playlist-id="${escapeHtml(playlist.id)}">Duplicate</button>
                            <button type="button" class="playlist-delete-button" data-playlist-id="${escapeHtml(playlist.id)}">Delete</button>
                        </div>
                    </div>
                    <div class="playlist-videos" data-playlist-dropzone="true" data-playlist-id="${escapeHtml(playlist.id)}">${videoHtml || '<div class="playlist-empty-card">Drop videos here.</div>'}</div>
                </section>
            `;
        }).join('');

        const hash = window.location.hash || '';
        if (hash.startsWith('#')) {
            const targetId = decodePlaylistRef(hash.slice(1));
            const target = document.getElementById(targetId);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('playlist-card-highlight');
                window.setTimeout(() => target.classList.remove('playlist-card-highlight'), 1800);
            }
        }

        function setStatus(message) {
            showStatusMessage(message);
        }

        container.querySelectorAll('.playlist-delete-button').forEach(button => {
            button.addEventListener('click', () => {
                setStatus(deletePlaylist(button.dataset.playlistId));
                renderPlaylistPage();
            });
        });

        container.querySelectorAll('.playlist-duplicate-button').forEach(button => {
            button.addEventListener('click', () => {
                setStatus(duplicatePlaylist(button.dataset.playlistId));
                renderPlaylistPage();
            });
        });

        container.querySelectorAll('.playlist-export-button').forEach(button => {
            button.addEventListener('click', async () => {
                setStatus('Exporting XSPF...');
                setStatus(await downloadPlaylistXspf(button.dataset.playlistId));
            });
        });

        container.querySelectorAll('.playlist-play-all-button').forEach(button => {
            button.addEventListener('click', () => {
                const message = playPlaylist(button.dataset.playlistId);
                if (message) setStatus(message);
            });
        });

        const dragState = { sourcePlaylistId: '', sourceIndex: -1 };

        container.querySelectorAll('.playlist-video-card').forEach(card => {
            card.addEventListener('dragstart', event => {
                dragState.sourcePlaylistId = card.dataset.playlistId || '';
                dragState.sourceIndex = Number(card.dataset.videoIndex);
                card.classList.add('is-dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', card.dataset.videoUrl || '');
                }
            });

            card.addEventListener('dragend', () => {
                dragState.sourcePlaylistId = '';
                dragState.sourceIndex = -1;
                container.querySelectorAll('.playlist-video-card.is-dragging').forEach(item => item.classList.remove('is-dragging'));
                container.querySelectorAll('.playlist-drop-target').forEach(item => item.classList.remove('playlist-drop-target'));
                container.querySelectorAll('.playlist-dropzone-active').forEach(item => item.classList.remove('playlist-dropzone-active'));
            });

            card.addEventListener('dragover', event => {
                event.preventDefault();
                card.classList.add('playlist-drop-target');
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
            });

            card.addEventListener('dragleave', event => {
                if (event.currentTarget === card) {
                    card.classList.remove('playlist-drop-target');
                }
            });

            card.addEventListener('drop', event => {
                event.preventDefault();
                event.stopPropagation();
                card.classList.remove('playlist-drop-target');

                const sourcePlaylistId = dragState.sourcePlaylistId;
                const sourceIndex = dragState.sourceIndex;
                const targetPlaylistId = card.dataset.playlistId || '';
                const targetIndex = Number(card.dataset.videoIndex);
                if (!sourcePlaylistId || sourceIndex < 0 || !targetPlaylistId || Number.isNaN(targetIndex)) return;

                setStatus(moveVideoBetweenPlaylists(sourcePlaylistId, sourceIndex, targetPlaylistId, targetIndex));
                renderPlaylistPage();
            });
        });

        container.querySelectorAll('[data-playlist-dropzone="true"]').forEach(zone => {
            zone.addEventListener('dragover', event => {
                event.preventDefault();
                zone.classList.add('playlist-dropzone-active');
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
            });

            zone.addEventListener('dragleave', event => {
                if (event.currentTarget === zone) {
                    zone.classList.remove('playlist-dropzone-active');
                }
            });

            zone.addEventListener('drop', event => {
                event.preventDefault();
                zone.classList.remove('playlist-dropzone-active');

                const sourcePlaylistId = dragState.sourcePlaylistId;
                const sourceIndex = dragState.sourceIndex;
                const targetPlaylistId = zone.dataset.playlistId || '';
                if (!sourcePlaylistId || sourceIndex < 0 || !targetPlaylistId) return;

                const targetIndex = zone.querySelectorAll('.playlist-video-card').length;
                setStatus(moveVideoBetweenPlaylists(sourcePlaylistId, sourceIndex, targetPlaylistId, targetIndex));
                renderPlaylistPage();
            });
        });
    }

    function applyPlaylistContext() {
        const context = getCurrentPlaylistContext();
        if (!context) return;

        applyPlaylistVideoOverrides(context);
        applyPlaylistSidebar(context);
    }

    document.addEventListener('DOMContentLoaded', () => {
        importConfiguredPlaylists();
        renderWatchControls();
        renderPlaylistPage();
        applyPlaylistContext();
    });

    document.addEventListener('videoPageUpdated', applyPlaylistContext);

    window.Playlists = {
        applyPlaylistContext,
        getCurrentPlaylistContext
    };
})();
