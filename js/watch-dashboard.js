(function () {
    'use strict';

    const SECTION_LIMIT = 8;

    function getVideos() {
        return window.VIDEOS_INDEX && Array.isArray(window.VIDEOS_INDEX.videos)
            ? window.VIDEOS_INDEX.videos
            : [];
    }

    function getProgress(video) {
        if (window.SugarHillProgress && typeof window.SugarHillProgress.getVideoProgressState === 'function') {
            return window.SugarHillProgress.getVideoProgressState(video);
        }
        return { currentTime: 0, duration: Number(video.duration) || 0, ratio: 0, status: 'unwatched', updatedAt: '' };
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
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
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

    function progressLabel(state) {
        if (state.status === 'completed') return 'Finished';
        if (state.status === 'unwatched') return 'Unwatched';
        return `${formatDuration(state.currentTime)} / ${formatDuration(state.duration)}`;
    }

    function createCard(video) {
        const state = getProgress(video);
        const duration = formatDuration(video.duration);
        const progressPercent = `${Math.round((state.ratio || 0) * 100)}%`;
        return `
            <article class="dashboard-video-card" style="--dashboard-progress:${progressPercent}">
                <a class="dashboard-video-link" href="${escapeHtml(video.url)}">
                    <div class="dashboard-video-thumbnail"${createPreviewAttrs(video.previewSprite)}>
                        ${video.thumbnail ? `<img src="${escapeHtml(video.thumbnail)}" alt="Thumbnail" class="dashboard-video-image">` : ''}
                        <span class="dashboard-video-duration">${duration}</span>
                    </div>
                    <div class="dashboard-video-body">
                        <div class="dashboard-video-title">${escapeHtml(video.title)}</div>
                        <div class="dashboard-video-meta">${escapeHtml(video.show)} - ${escapeHtml(progressLabel(state))}</div>
                    </div>
                </a>
                <button type="button" class="dashboard-queue-button" data-queue-add-url="${escapeHtml(video.url)}">Queue</button>
            </article>
        `;
    }

    function renderSection(title, videos) {
        if (!videos.length) return '';
        return `
            <section class="watch-dashboard-section">
                <div class="watch-dashboard-section-header">
                    <h2>${escapeHtml(title)}</h2>
                    <span>${videos.length}</span>
                </div>
                <div class="watch-dashboard-row">
                    ${videos.slice(0, SECTION_LIMIT).map(createCard).join('')}
                </div>
            </section>
        `;
    }

    function byRecent(a, b) {
        return String(getProgress(b).updatedAt || '').localeCompare(String(getProgress(a).updatedAt || ''));
    }

    function renderDashboard() {
        const root = document.getElementById('watch-dashboard');
        const sectionsRoot = document.getElementById('watch-dashboard-sections');
        if (!root || !sectionsRoot) return;

        const videos = getVideos();
        if (!videos.length) {
            root.hidden = true;
            return;
        }

        const withState = videos.map(video => ({ video, state: getProgress(video) }));
        const continueWatching = withState
            .filter(item => item.state.status === 'inProgress' || item.state.status === 'nearlyFinished')
            .map(item => item.video)
            .sort(byRecent);
        const nearlyFinished = withState
            .filter(item => item.state.status === 'nearlyFinished')
            .map(item => item.video)
            .sort(byRecent);
        const recentlyWatched = withState
            .filter(item => item.state.updatedAt)
            .map(item => item.video)
            .sort(byRecent);
        const unwatched = withState
            .filter(item => item.state.status === 'unwatched')
            .map(item => item.video);

        sectionsRoot.innerHTML = [
            renderSection('Continue Watching', continueWatching),
            renderSection('Nearly Finished', nearlyFinished),
            renderSection('Recently Watched', recentlyWatched),
            renderSection('Unwatched', unwatched)
        ].join('');

        const completed = withState.filter(item => item.state.status === 'completed').length;
        const summary = document.getElementById('watch-dashboard-summary');
        if (summary) {
            summary.textContent = `${videos.length} videos - ${continueWatching.length} in progress - ${completed} finished`;
        }

        if (!sectionsRoot.textContent.trim()) {
            sectionsRoot.innerHTML = renderSection('Unwatched', videos);
        }
        if (typeof window.renderThumbnailProgressBars === 'function') {
            window.renderThumbnailProgressBars();
        }
        if (typeof window.initVideoPreviews === 'function') {
            window.initVideoPreviews(sectionsRoot);
        }
        if (window.SugarHillQueue && typeof window.SugarHillQueue.decorateVideoCards === 'function') {
            window.SugarHillQueue.decorateVideoCards(sectionsRoot);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderDashboard);
    } else {
        renderDashboard();
    }

    document.addEventListener('sugarhill:progress-changed', renderDashboard);
    window.addEventListener('storage', renderDashboard);
})();
