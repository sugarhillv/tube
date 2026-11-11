(function () {
    'use strict';

    const QUEUE_KEY = 'sugarhill-watch-queue-v1';
    const QUEUE_PARAM = 'queue';
    const QUEUE_ITEM_PARAM = 'queueItem';

    let drawerOpen = false;

    function createId() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return window.crypto.randomUUID();
        }
        return `queue-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }

    function getVideos() {
        return window.VIDEOS_INDEX && Array.isArray(window.VIDEOS_INDEX.videos)
            ? window.VIDEOS_INDEX.videos
            : [];
    }

    function pageUrlFromHref(href) {
        if (window.SugarHillProgress && typeof window.SugarHillProgress.getVideoPathFromHref === 'function') {
            return window.SugarHillProgress.getVideoPathFromHref(href);
        }
        try {
            const url = new URL(href, window.location.href);
            return url.pathname.split('/').pop();
        } catch (error) {
            return String(href || '').split('?')[0].split('/').pop();
        }
    }

    function getCurrentPageUrl() {
        return pageUrlFromHref(window.location.href);
    }

    function findVideoByUrl(url) {
        const pageUrl = pageUrlFromHref(url);
        return getVideos().find(video => pageUrlFromHref(video.url) === pageUrl) || null;
    }

    function cloneVideo(video) {
        return {
            id: video.id || video.url,
            queueItemId: video.queueItemId || createId(),
            title: video.title || 'Untitled video',
            show: video.show || '',
            url: pageUrlFromHref(video.url || ''),
            mediaSrc: video.mediaSrc || '',
            duration: Number(video.duration) || 0,
            thumbnail: video.thumbnail || '',
            previewSprite: video.previewSprite || null
        };
    }

    function currentVideoFromPanel() {
        const panel = document.querySelector('.playlist-panel');
        if (!panel) return null;
        return cloneVideo({
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
        });
    }

    function readQueue() {
        try {
            const rawValue = localStorage.getItem(QUEUE_KEY);
            const parsed = rawValue ? JSON.parse(rawValue) : [];
            return Array.isArray(parsed) ? parsed.map(cloneVideo) : [];
        } catch (error) {
            console.warn('Error reading watch queue:', error);
            return [];
        }
    }

    function writeQueue(queue) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify((queue || []).map(cloneVideo)));
        renderQueueDock();
        applyQueueContext();
    }

    function addToQueue(video) {
        if (!video || !video.url) {
            showStatus('Could not add that video to the queue.');
            return;
        }
        const queue = readQueue();
        const queuedVideo = cloneVideo(video);
        queue.push(queuedVideo);
        writeQueue(queue);
        showStatus(`Queued "${queuedVideo.title}".`);
    }

    function removeFromQueue(queueItemId) {
        writeQueue(readQueue().filter(video => video.queueItemId !== queueItemId));
    }

    function moveQueueItem(queueItemId, direction) {
        const queue = readQueue();
        const index = queue.findIndex(video => video.queueItemId === queueItemId);
        const nextIndex = index + direction;
        if (index < 0 || nextIndex < 0 || nextIndex >= queue.length) return;
        const [item] = queue.splice(index, 1);
        queue.splice(nextIndex, 0, item);
        writeQueue(queue);
    }

    function clearQueue() {
        writeQueue([]);
        showStatus('Cleared watch queue.');
    }

    function withQueueVideoQuery(video) {
        const url = new URL(video.url, window.location.href);
        url.searchParams.set(QUEUE_PARAM, '1');
        url.searchParams.set(QUEUE_ITEM_PARAM, video.queueItemId);
        return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
    }

    function playQueue() {
        const queue = readQueue();
        if (!queue.length) {
            showStatus('Queue a video first.');
            return;
        }
        window.location.href = withQueueVideoQuery(queue[0]);
    }

    function getQueueContext() {
        const params = new URLSearchParams(window.location.search);
        if (params.get(QUEUE_PARAM) !== '1') return null;
        const queue = readQueue();
        if (!queue.length) return null;

        const queueItemId = params.get(QUEUE_ITEM_PARAM) || '';
        const pageUrl = getCurrentPageUrl();
        const index = queueItemId
            ? queue.findIndex(video => video.queueItemId === queueItemId)
            : queue.findIndex(video => pageUrlFromHref(video.url) === pageUrl);
        if (index < 0) return null;

        return {
            queue,
            currentIndex: index,
            current: queue[index],
            previous: index > 0 ? queue[index - 1] : null,
            next: index < queue.length - 1 ? queue[index + 1] : null
        };
    }

    function applyQueueContext() {
        const context = getQueueContext();
        const videoElement = document.querySelector('video');
        if (!context || !videoElement) {
            renderQueueDock();
            return;
        }

        if (context.next) {
            videoElement.setAttribute('data-next-url', withQueueVideoQuery(context.next));
            videoElement.setAttribute('data-next-title', context.next.title || '');
        } else {
            videoElement.setAttribute('data-next-url', '');
            videoElement.setAttribute('data-next-title', '');
            videoElement.setAttribute('data-fallback-url', '');
            videoElement.setAttribute('data-fallback-title', '');
        }
        renderQueueDock();
    }

    function escapeHtml(value) {
        const div = document.createElement('div');
        div.textContent = value || '';
        return div.innerHTML;
    }

    function formatDuration(seconds) {
        const total = Math.max(0, Math.floor(Number(seconds) || 0));
        const hours = Math.floor(total / 3600);
        const minutes = Math.floor((total % 3600) / 60);
        const secs = total % 60;
        if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function showStatus(message) {
        const text = String(message || '').trim();
        if (!text) return;

        let stack = document.querySelector('.floating-status-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.className = 'floating-status-stack';
            stack.setAttribute('aria-live', 'polite');
            stack.setAttribute('aria-atomic', 'false');
            document.body.appendChild(stack);
        }

        const banner = document.createElement('button');
        banner.type = 'button';
        banner.className = 'floating-status-banner is-success';
        banner.textContent = text;
        banner.addEventListener('click', () => banner.remove());
        stack.appendChild(banner);
        window.requestAnimationFrame(() => banner.classList.add('is-visible'));
        window.setTimeout(() => {
            banner.classList.add('is-exiting');
            window.setTimeout(() => banner.remove(), 350);
        }, 3000);
    }

    function ensureQueueShell() {
        let shell = document.getElementById('watch-queue-shell');
        if (shell) return shell;
        shell = document.createElement('div');
        shell.id = 'watch-queue-shell';
        shell.className = 'watch-queue-shell';
        document.body.appendChild(shell);
        return shell;
    }

    function queueRow(video, index, count, currentItemId) {
        const isCurrent = video.queueItemId === currentItemId;
        return `
            <article class="watch-queue-item${isCurrent ? ' is-current' : ''}">
                <a class="watch-queue-item-link" href="${escapeHtml(withQueueVideoQuery(video))}">
                    ${video.thumbnail ? `<img src="${escapeHtml(video.thumbnail)}" alt="Thumbnail" class="watch-queue-thumb">` : '<span class="watch-queue-thumb"></span>'}
                    <span class="watch-queue-item-text">
                        <span class="watch-queue-title">${escapeHtml(video.title)}</span>
                        <span class="watch-queue-meta">${escapeHtml(video.show)} - ${formatDuration(video.duration)}</span>
                    </span>
                </a>
                <span class="watch-queue-item-actions">
                    <button type="button" data-queue-move-up="${escapeHtml(video.queueItemId)}" ${index === 0 ? 'disabled' : ''}>Up</button>
                    <button type="button" data-queue-move-down="${escapeHtml(video.queueItemId)}" ${index === count - 1 ? 'disabled' : ''}>Down</button>
                    <button type="button" data-queue-remove="${escapeHtml(video.queueItemId)}">Remove</button>
                </span>
            </article>
        `;
    }

    function renderQueueDock() {
        if (!document.body) return;
        const shell = ensureQueueShell();
        const queue = readQueue();
        const context = getQueueContext();
        const currentItemId = context && context.current ? context.current.queueItemId : '';
        const countText = `${queue.length}`;

        shell.innerHTML = `
            <button type="button" class="watch-queue-toggle" aria-expanded="${drawerOpen ? 'true' : 'false'}">
                Queue <span>${countText}</span>
            </button>
            <section class="watch-queue-drawer" ${drawerOpen ? '' : 'hidden'} aria-label="Watch queue">
                <div class="watch-queue-header">
                    <h2>Watch Queue</h2>
                    <button type="button" class="watch-queue-close" aria-label="Close queue">Close</button>
                </div>
                <div class="watch-queue-actions">
                    <button type="button" class="watch-queue-play">Play Queue</button>
                    <button type="button" class="watch-queue-clear" ${queue.length ? '' : 'disabled'}>Clear</button>
                </div>
                <div class="watch-queue-list">
                    ${queue.length ? queue.map((video, index) => queueRow(video, index, queue.length, currentItemId)).join('') : '<div class="watch-queue-empty">No queued videos.</div>'}
                </div>
            </section>
        `;

        const toggle = shell.querySelector('.watch-queue-toggle');
        const close = shell.querySelector('.watch-queue-close');
        const play = shell.querySelector('.watch-queue-play');
        const clear = shell.querySelector('.watch-queue-clear');

        if (toggle) {
            toggle.addEventListener('click', () => {
                drawerOpen = !drawerOpen;
                renderQueueDock();
            });
        }
        if (close) {
            close.addEventListener('click', () => {
                drawerOpen = false;
                renderQueueDock();
            });
        }
        if (play) play.addEventListener('click', playQueue);
        if (clear) clear.addEventListener('click', clearQueue);

        shell.querySelectorAll('[data-queue-remove]').forEach(button => {
            button.addEventListener('click', () => removeFromQueue(button.dataset.queueRemove));
        });
        shell.querySelectorAll('[data-queue-move-up]').forEach(button => {
            button.addEventListener('click', () => moveQueueItem(button.dataset.queueMoveUp, -1));
        });
        shell.querySelectorAll('[data-queue-move-down]').forEach(button => {
            button.addEventListener('click', () => moveQueueItem(button.dataset.queueMoveDown, 1));
        });
    }

    function bindCurrentButtons(root) {
        const scope = root || document;
        const buttons = [];
        if (scope.nodeType === 1 && scope.matches('[data-queue-add-current]')) {
            buttons.push(scope);
        }
        scope.querySelectorAll('[data-queue-add-current]').forEach(button => buttons.push(button));
        buttons.forEach(button => {
            if (button.dataset.queueBound === 'true') return;
            button.dataset.queueBound = 'true';
            button.addEventListener('click', () => addToQueue(currentVideoFromPanel()));
        });
    }

    function decorateVideoCards(root) {
        const scope = root || document;
        const links = [];
        if (scope.nodeType === 1 && scope.matches('a.video-item[href], a.nav-link[href]')) {
            links.push(scope);
        }
        scope.querySelectorAll('a.video-item[href], a.nav-link[href]').forEach(link => links.push(link));
        links.forEach(link => {
            if (link.dataset.queueDecorated === 'true') return;
            const video = findVideoByUrl(link.getAttribute('href'));
            if (!video) return;
            const target = link.querySelector('.video-item-thumbnail-container, .nav-link-thumbnail-container') || link;
            if (target.querySelector('.queue-card-button')) return;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'queue-card-button';
            button.textContent = 'Queue';
            button.setAttribute('aria-label', `Add ${video.title || 'video'} to queue`);
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                addToQueue(video);
            });
            target.appendChild(button);
            link.dataset.queueDecorated = 'true';
        });

        const addButtons = [];
        if (scope.nodeType === 1 && scope.matches('[data-queue-add-url]')) {
            addButtons.push(scope);
        }
        scope.querySelectorAll('[data-queue-add-url]').forEach(button => addButtons.push(button));
        addButtons.forEach(button => {
            if (button.dataset.queueBound === 'true') return;
            button.dataset.queueBound = 'true';
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                addToQueue(findVideoByUrl(button.dataset.queueAddUrl));
            });
        });
    }

    function bind() {
        renderQueueDock();
        bindCurrentButtons(document);
        decorateVideoCards(document);
        applyQueueContext();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType !== 1) return;
                    bindCurrentButtons(node);
                    decorateVideoCards(node);
                });
            });
        });
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bind);
    } else {
        bind();
    }

    document.addEventListener('videoPageUpdated', () => {
        bindCurrentButtons(document);
        decorateVideoCards(document);
        applyQueueContext();
    });

    window.addEventListener('storage', event => {
        if (event && event.key === QUEUE_KEY) {
            renderQueueDock();
            applyQueueContext();
        }
    });

    window.SugarHillQueue = {
        addToQueue,
        readQueue,
        writeQueue,
        playQueue,
        decorateVideoCards,
        applyQueueContext
    };
})();
