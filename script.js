(() => {
  'use strict';
  const MODE = new URLSearchParams(window.location.search).get('ai-webhook') === 'test' ? 'test' : 'production';
  const URLS = {
    production: 'https://n8n.srv1136783.hstgr.cloud/webhook/recherche-ia-webflow',
    test: 'https://n8n.srv1136783.hstgr.cloud/webhook-test/recherche-ia-webflow',
  };
  const TIMEOUT_MS = 90_000;
  const SCRIPT_VERSION = '2026-11-11-detail-title-unicode';
  function shuffleLoadingMessages(phrases, previousMessage = '') {
    const messages = [...phrases];
    for (let index = messages.length - 1; index > 0; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [messages[index], messages[randomIndex]] = [messages[randomIndex], messages[index]];
    }
    if (messages.length > 1 && messages[0] === previousMessage) {
      const swapIndex = 1 + Math.floor(Math.random() * (messages.length - 1));
      [messages[0], messages[swapIndex]] = [messages[swapIndex], messages[0]];
    }
    return messages;
  }
  const conversationId = () => {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  const shortText = (value, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : '';
  const hasInternalCopy = value => {
    const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /\b(?:webflow|algolia|cms|catalogue|identifiants?|synchronisation|donnees?|candidats?|match[_ -]?status|object[_ -]?id|api|schema|scores?|controle interne|verification interne)\b/.test(normalized)
      || /\b[0-9a-f]{24}\b/i.test(value);
  };
  const visitorText = (value, fallback = '', max = 2000) => {
    const content = shortText(value, max);
    return content && !hasInternalCopy(content) ? content : fallback;
  };
  const detailShow = data => {
    if (data.criteria?.conversation_mode !== 'detail') return null;
    const shows = data.results.filter(show => show && typeof show === 'object' && !Array.isArray(show));
    const target = data.detail_target?.webflow_id;
    return target ? shows.find(show => (show.webflow_id || show.id) === target) || null
      : shows.length === 1 ? shows[0] : null;
  };
  const showHref = show => {
    let slug = shortText(show?.slug, 200);
    if (!slug && show?.url) {
      try { slug = new URL(show.url, window.location.origin).pathname.match(/^\/spectacles\/([^/]+)\/?$/)?.[1] || ''; }
      catch { return ''; }
    }
    return /^[a-z0-9][a-z0-9-]{0,199}$/i.test(slug) ? `/spectacles/${slug}?utm_source=chatbot` : '';
  };
  function titleTextMap(value) {
    let folded = '', offset = 0;
    const starts = [], ends = [];
    for (const character of value) {
      const start = offset;
      offset += character.length;
      const normalized = character.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('fr')
        .replace(/[’‘ʼ]/g, "'").replace(/[‐‑–—]/g, '-')
        .replace(/[\u200b-\u200d\u2060\ufeff]/g, '').replace(/\s/g, ' ');
      if (!normalized || normalized === ' ' && folded.endsWith(' ')) {
        if (ends.length) ends[ends.length - 1] = offset;
        continue;
      }
      folded += normalized;
      for (let i = 0; i < normalized.length; i++) { starts.push(start); ends.push(offset); }
    }
    return {folded, starts, ends};
  }
  function linkDetailTitle(content, data) {
    const show = detailShow(data), href = showHref(show);
    const title = shortText(show?.title, 200), text = content.textContent;
    if (!title || !href) return;
    const mapped = titleTextMap(text), needle = titleTextMap(title).folded;
    if (!needle) return;
    let match = mapped.folded.indexOf(needle);
    while (match >= 0 && (/[\p{L}\p{N}]/u.test(mapped.folded[match - 1] || '')
      || /[\p{L}\p{N}]/u.test(mapped.folded[match + needle.length] || ''))) {
      match = mapped.folded.indexOf(needle, match + 1);
    }
    const index = match < 0 ? 0 : mapped.starts[match];
    const end = match < 0 ? 0 : mapped.ends[match + needle.length - 1];
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = match < 0 ? title : text.slice(index, end);
    if (match < 0) {
      content.prepend(link, document.createTextNode(' — '));
      return;
    }
    content.replaceChildren(document.createTextNode(text.slice(0, index)), link,
      document.createTextNode(text.slice(end)));
  }
  function assistantMemory(data) {
    const lines = [`Réponse : ${visitorText(data.answer, 'Voici quelques idées de spectacles.').slice(0, 500)}`];
    if (data.criteria && typeof data.criteria === 'object' && !Array.isArray(data.criteria)) {
      const criteria = Object.entries(data.criteria).filter(([, value]) => value !== null && value !== false && value !== ''
        && (!Array.isArray(value) || value.length > 0));
      for (const [key, value] of criteria) {
        const entry = `${key}=${shortText(JSON.stringify(value), 350)}`;
        if (lines.join('\n').length + entry.length > 2800) break;
        lines.push(entry);
      }
    }
    const shows = (cards, label) => {
      if (!Array.isArray(cards) || !cards.length) return;
      lines.push(`${label} (ordre de présentation) :`);
      cards.slice(0, 5).forEach((show, index) => {
        lines.push(`${index + 1}. ${shortText(show?.title, 150)} [${shortText(show?.webflow_id || show?.id, 60)}] : ${visitorText(show?.reason, 'Ce spectacle pourrait vous plaire.').slice(0, 360)}`);
      });
    };
    shows(data.results, 'Spectacles proposés');
    const conclusion = data.results?.length ? visitorText(data.conclusion).slice(0, 400) : '';
    if (conclusion) lines.push(`Conclusion : ${conclusion}`);
    const followUp = data.follow_up_question
      ? visitorText(data.follow_up_question, 'Pouvez-vous préciser ce que vous recherchez ?').slice(0, 300)
      : '';
    if (followUp) lines.push(`Question de suivi : ${followUp}`);
    return lines.join('\n').slice(0, 5500);
  }
  const formatDuration = ms => {
    const value = Math.max(0, Math.floor(ms));
    return `${String(Math.floor(value / 1000)).padStart(2, '0')}:${String(value % 1000).padStart(3, '0')}`;
  };

  function animateQuestionPlaceholder(input, root, reducedMotion) {
    const phrases = (input.getAttribute('data-ai-search-placeholders') || '')
      .split(',').map(phrase => phrase.trim()).filter(Boolean);
    if (!phrases.length) return () => {};

    const letters = phrases.map(phrase => typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(phrase), part => part.segment)
      : Array.from(phrase));
    let phraseIndex = 0;
    let position = 0;
    let deleting = false;
    let timeout = null;
    const motionPreference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const pause = () => {
      if (timeout !== null) clearTimeout(timeout);
      timeout = null;
      input.placeholder = phrases[phraseIndex];
    };
    const canAnimate = () => phrases.length > 1 && !reducedMotion() && !document.hidden
      && !input.value && document.activeElement !== input
      && root.getAttribute('data-ai-search-state') !== 'chat';
    const tick = () => {
      timeout = null;
      if (!canAnimate()) { pause(); return; }
      if (deleting) {
        position--;
        input.placeholder = letters[phraseIndex].slice(0, position).join('');
        if (position === 0) {
          phraseIndex = (phraseIndex + 1) % phrases.length;
          deleting = false;
          timeout = setTimeout(tick, 300);
        } else timeout = setTimeout(tick, 35);
      } else {
        position++;
        input.placeholder = letters[phraseIndex].slice(0, position).join('');
        if (position === letters[phraseIndex].length) {
          deleting = true;
          timeout = setTimeout(tick, 2300);
        } else timeout = setTimeout(tick, 65);
      }
    };
    const sync = () => {
      pause();
      if (!canAnimate()) return;
      position = 0;
      deleting = false;
      input.placeholder = '';
      timeout = setTimeout(tick, 150);
    };
    input.addEventListener('focus', sync);
    input.addEventListener('blur', sync);
    input.addEventListener('input', sync);
    document.addEventListener('visibilitychange', sync);
    motionPreference?.addEventListener?.('change', sync);
    sync();
    return sync;
  }

  function createShowCardsRenderer(root, streamText, reducedMotion, queueResponseScroll) {
    // Migration : l'ancien bloc embarqué reste compatible tant que l'URL dédiée
    // n'est pas configurée. Sans bloc embarqué, /chatbot-cartes est la source.
    const embeddedSource = root.querySelector('[data-ai-search-swiper-source]');
    const configuredUrl = root.getAttribute('data-ai-search-catalog-url');
    const useEmbeddedSource = embeddedSource && !configuredUrl;
    const slidesById = new Map();
    const slidesBySlug = new Map();
    const slidesByTitle = new Map();
    const duplicateTitles = new Set();
    const loadedPages = new Set();
    const nextPageByUrl = new Map();
    const pendingPages = new Map();
    const activeLoads = new Set();
    const failedPages = new Set();
    let warmGeneration = 0;
    const catalogOrigin = window.location.origin;
    const maxCatalogPages = 20;
    const catalogBudgetMs = 20000;
    let catalogPath = '';
    let nextUrl = null;
    let sourceError = null;
    let shellHtml = '';
    try {
      const url = new URL(useEmbeddedSource ? window.location.href
        : configuredUrl || '/chatbot-cartes', catalogOrigin);
      if (url.origin !== catalogOrigin || !['https:', 'http:'].includes(url.protocol)
        || url.username || url.password) throw Error();
      url.hash = '';
      catalogPath = url.pathname;
      nextUrl = url.href;
    } catch (error) { sourceError = error; }
    // Le renderer vit aussi longtemps que la conversation, même après fermeture
    // du chatbot ou lorsque les premiers échanges sortent de l'historique envoyé.
    let foundersImageShown = false;
    const foundersImageUrl = 'https://cdn.prod.website-files.com/67f3c6fa3878c7fd694d3857/6af20c7501b1fc0ca6f615d7_martin-mordue.avif';
    const foundersTopics = new Set(['fondateurs', 'suzanne_blog', 'suzanne_parcours',
      'suzanne_gouts', 'martin_parcours', 'martin_gouts', 'origine']);

    const text = value => typeof value === 'string' ? value.trim() : '';
    const titleKey = value => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const identifier = show => text(show?.webflow_id) || text(show?.id);
    const trackedInternalHref = url => {
      url.searchParams.set('utm_source', 'chatbot');
      return `${url.pathname}${url.search}${url.hash}`;
    };
    const openInNewTab = link => {
      if (!link.getAttribute('href')) return;
      link.target = '_blank';
      link.rel = [...new Set(`${link.rel} noopener`.trim().split(/\s+/))].join(' ');
    };
    const slugFromUrl = value => {
      try {
        const url = new URL(value, catalogOrigin);
        return decodeURIComponent(url.pathname.match(/^\/spectacles\/([^/]+)\/?$/)?.[1] || '');
      } catch { return ''; }
    };
    const slugOf = show => {
      const supplied = text(show?.slug) || slugFromUrl(text(show?.url));
      if (supplied) return supplied;
      const byTitle = slidesByTitle.get(titleKey(show?.title));
      return byTitle ? byTitle.slug : '';
    };

    function slideField(slide, name) {
      const element = slide.matches(`[${name}]`) ? slide : slide.querySelector(`[${name}]`);
      if (!element) return '';
      return text(element.getAttribute(name)) || (element === slide ? '' : text(element.textContent));
    }

    function slideSlug(slide) {
      const explicit = slideField(slide, 'data-ai-search-show-slug');
      if (explicit) return explicit;
      const link = slide.querySelector('a[href*="/spectacles/"]');
      return link ? slugFromUrl(link.getAttribute('href')) : '';
    }

    function indexPage(doc, pageUrl) {
      const catalog = doc.querySelector('[data-ai-search-swiper-source]');
      const list = catalog?.querySelector('[data-swiper-wrap] .swiper-wrapper.w-dyn-items');
      if (!list) throw Error();
      if (!shellHtml) {
        const shell = catalog.cloneNode(true);
        shell.querySelector('[data-swiper-wrap] .swiper-wrapper.w-dyn-items').replaceChildren();
        shell.querySelectorAll('.w-pagination-wrapper, [data-ai-search-catalog-next], script, iframe, object, embed')
          .forEach(node => node.remove());
        shellHtml = shell.outerHTML;
      }
      for (const slide of list.children) {
        if (!slide.classList.contains('swiper-slide')) continue;
        const id = slideField(slide, 'data-ai-search-webflow-id');
        const slug = slideSlug(slide);
        const title = titleKey(slide.querySelector('.show_title_small')?.textContent
          || slide.querySelector('a.show_item_link[aria-label]')?.getAttribute('aria-label'));
        // Garder du texte, jamais des nœuds dont ownerDocument retient la page complète.
        const record = { id, slug, html: slide.outerHTML };
        if (id && !slidesById.has(id)) slidesById.set(id, record);
        if (slug && !slidesBySlug.has(slug)) slidesBySlug.set(slug, record);
        if (title && !duplicateTitles.has(title)) {
          const previous = slidesByTitle.get(title);
          if (previous && !((id && previous.id === id) || (slug && previous.slug === slug))) {
            slidesByTitle.delete(title);
            duplicateTitles.add(title);
          } else if (!previous) slidesByTitle.set(title, record);
        }
      }
      const next = catalog.querySelector('[data-ai-search-catalog-next][href], .w-pagination-next[href]');
      let candidate = null;
      try { if (next) candidate = new URL(next.getAttribute('href'), pageUrl); } catch {}
      if (candidate) candidate.hash = '';
      loadedPages.add(pageUrl);
      const followingUrl = candidate && candidate.origin === catalogOrigin && candidate.pathname === catalogPath
        && !candidate.username && !candidate.password && candidate.href !== pageUrl
        ? candidate.href : null;
      nextPageByUrl.set(pageUrl, followingUrl);
    }

    if (useEmbeddedSource && !sourceError) {
      try { indexPage(document, nextUrl); nextUrl = nextPageByUrl.get(nextUrl); }
      catch (error) { sourceError = error; }
    }

    function findSlide(show) {
      const id = identifier(show);
      const slug = slugOf(show);
      const byId = id ? slidesById.get(id) : null;
      if (byId) return byId;
      const bySlug = slug ? slidesBySlug.get(slug) : null;
      // Si un ID Webflow est exposé dans le CMS, il doit confirmer le slug.
      if (bySlug && id) {
        const sourceId = bySlug.id;
        if (sourceId && sourceId !== id) return null;
      }
      if (bySlug) return bySlug;
      // Le webhook peut fournir l'ID sans slug, alors que Webflow n'expose pas
      // l'ID natif dans la carte. Le titre CMS est un dernier recours, seulement
      // quand il est unique parmi les pages déjà indexées.
      if (!slug) {
        const byTitle = slidesByTitle.get(titleKey(show?.title));
        if (byTitle) {
          const sourceId = byTitle.id;
          if (!id || !sourceId || sourceId === id) return byTitle;
        }
      }
      return null;
    }

    async function fetchCatalogPage(url, remainingMs) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), Math.min(12000, remainingMs));
      try {
        const response = await fetch(url, {
          method: 'GET', credentials: 'same-origin', signal: controller.signal,
          headers: { Accept: 'text/html' },
        });
        if (!response.ok) throw Error();
        const finalUrl = new URL(response.url);
        finalUrl.hash = '';
        if (finalUrl.origin !== catalogOrigin || finalUrl.pathname !== catalogPath) throw Error();
        const html = await response.text();
        if (html.length > 2000000) throw Error();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        indexPage(doc, finalUrl.href);
        loadedPages.add(url);
        nextPageByUrl.set(url, nextPageByUrl.get(finalUrl.href));
      } finally { clearTimeout(timeout); }
    }

    function loadNextPage(url, remainingMs) {
      if (loadedPages.has(url)) return Promise.resolve();
      if (pendingPages.has(url)) return pendingPages.get(url);
      if (failedPages.has(url)) return Promise.reject(Error());
      const deadline = Date.now() + remainingMs;
      const promise = (async () => {
        while (activeLoads.size >= 2) {
          await Promise.race([...activeLoads].map(task => task.catch(() => {})));
        }
        if (Date.now() >= deadline) throw Error();
        const task = fetchCatalogPage(url, deadline - Date.now());
        activeLoads.add(task);
        try { await task; }
        finally { activeLoads.delete(task); }
      })().catch(error => { failedPages.add(url); throw error; })
        .finally(() => pendingPages.delete(url));
      pendingPages.set(url, promise);
      return promise;
    }

    function stopPreparing() { warmGeneration++; }

    function prepareCatalog() {
      stopPreparing();
      failedPages.clear();
      // Seulement après un envoi volontaire, jamais au chargement ou au scroll.
      // L'ancien catalogue embarqué garde son comportement à la demande.
      if (useEmbeddedSource || sourceError || !nextUrl) return;
      const generation = warmGeneration;
      const deadline = Date.now() + catalogBudgetMs;
      const active = () => generation === warmGeneration && Date.now() < deadline;
      const warm = async () => {
        let cursor = nextUrl;
        const visited = new Set();
        while (cursor && loadedPages.has(cursor)) {
          if (visited.has(cursor)) return;
          visited.add(cursor);
          cursor = nextPageByUrl.get(cursor);
        }
        if (!cursor || loadedPages.size >= maxCatalogPages || !active()) return;
        await loadNextPage(cursor, deadline - Date.now());
        if (!active()) return;
        const following = nextPageByUrl.get(cursor);
        if (!following) return;
        const seed = new URL(following);
        const entry = [...seed.searchParams].find(([key, value]) => /_page$/.test(key) && /^\d+$/.test(value));
        if (!entry) return; // Pagination atypique : le lecteur à la demande prend le relais.
        const [key, value] = entry;
        let page = Number(value);
        if (!Number.isSafeInteger(page) || page < 2) return;
        let lastPage = page + Math.max(0, maxCatalogPages - loadedPages.size - pendingPages.size) - 1;
        while (active() && page <= lastPage) {
          const batch = [];
          for (let slot = 0; slot < 2 && page <= lastPage; slot++) {
            const current = page++;
            const target = new URL(seed.href);
            target.searchParams.set(key, String(current));
            batch.push(loadNextPage(target.href, deadline - Date.now()).then(() => {
              if (!nextPageByUrl.get(target.href)) lastPage = Math.min(lastPage, current);
            }));
          }
          // Attendre les deux résultats avant de planifier un nouveau lot :
          // une fin de catalogue évite de poursuivre la lecture spéculative.
          await Promise.all(batch);
        }
      };
      void warm().catch(() => {});
    }

    async function resolveSlides(shows) {
      const deadline = Date.now() + catalogBudgetMs;
      const visited = new Set();
      while (shows.some(show => !findSlide(show)) && nextUrl && !visited.has(nextUrl)) {
        const url = nextUrl;
        visited.add(url);
        if (!loadedPages.has(url)) {
          const remainingMs = deadline - Date.now();
          if (remainingMs <= 0 || loadedPages.size >= maxCatalogPages) break;
          await loadNextPage(url, remainingMs);
        }
        nextUrl = nextPageByUrl.get(url) || null;
      }
      return shows.map(show => ({ show, slide: findSlide(show) }));
    }

    function uniqueIds(element, prefix) {
      const ids = new Map();
      for (const node of [element, ...element.querySelectorAll('[id]')]) {
        if (node.id) {
          const replacement = `${prefix}-${node.id}`;
          ids.set(node.id, replacement);
          node.id = replacement;
        }
      }
      for (const node of [element, ...element.querySelectorAll('*')]) {
        for (const attribute of [...node.attributes]) {
          let value = attribute.value;
          for (const [oldId, newId] of ids) {
            value = value.split(`url(#${oldId})`).join(`url(#${newId})`);
            if (['href', 'xlink:href'].includes(attribute.name) && value === `#${oldId}`) value = `#${newId}`;
            if (['aria-labelledby', 'aria-describedby', 'for'].includes(attribute.name)) {
              value = value.split(/\s+/).map(id => id === oldId ? newId : id).join(' ');
            }
          }
          if (value !== attribute.value) node.setAttribute(attribute.name, value);
        }
      }
    }

    function cleanSlide(original, show, requestId, index) {
      const template = document.createElement('template');
      template.innerHTML = original.html;
      const slide = template.content.firstElementChild;
      slide.removeAttribute('style');
      slide.classList.remove('swiper-slide-active', 'swiper-slide-next', 'swiper-slide-prev',
        'swiper-slide-visible', 'swiper-slide-fully-visible');
      slide.removeAttribute('aria-label');
      slide.removeAttribute('aria-hidden');
      slide.setAttribute('data-ai-search-webflow-id', identifier(show));
      slide.setAttribute('data-ai-search-show-slug', slugOf(show));
      uniqueIds(slide, `ai-swiper-${requestId}-${index}`);
      for (const node of slide.querySelectorAll('script, iframe, object, embed, base, link[rel="stylesheet"]')) node.remove();
      for (const node of [slide, ...slide.querySelectorAll('*')]) {
        for (const attribute of [...node.attributes]) {
          if (/^on/i.test(attribute.name) || attribute.name === 'srcdoc' || attribute.name.startsWith('data-gtm-vis')) {
            node.removeAttribute(attribute.name);
          }
        }
        for (const name of ['href', 'src', 'poster', 'action', 'xlink:href']) {
          const value = node.getAttribute(name);
          if (!value || value.startsWith('#')) continue;
          try {
            const url = new URL(value, catalogOrigin);
            if (name === 'href' && node.tagName === 'A' && url.origin === catalogOrigin
              && ['http:', 'https:'].includes(url.protocol)) {
              node.setAttribute(name, trackedInternalHref(url));
            } else if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) {
              node.setAttribute(name, url.href);
            }
            else node.removeAttribute(name);
          } catch { node.removeAttribute(name); }
        }
        if (node.tagName === 'A') openInNewTab(node);
      }
      return slide;
    }

    function detailSlide(show) {
      const href = showHref(show);
      let poster;
      try { poster = new URL(text(show.image_url)); } catch { return null; }
      if (!href || !['https:', 'http:'].includes(poster.protocol) || poster.username || poster.password) return null;
      const element = (tag, className, parent) => {
        const node = document.createElement(tag);
        node.className = className;
        parent?.appendChild(node);
        return node;
      };
      const slide = element('div', 'swiper-slide show_item w-dyn-item');
      slide.setAttribute('role', 'listitem');
      const wrapper = element('div', 'show_item_wrapper', slide);
      const link = element('a', 'show_item_link w-inline-block', wrapper);
      link.href = href;
      link.setAttribute('aria-label', text(show.title));
      const content = element('div', 'show_item_content', wrapper);
      const card = element('div', 'show_card', content);
      const posterWrap = element('div', 'show_poster_wrapper', card);
      const img = element('img', 'show_poster_image', posterWrap);
      img.src = poster.href;
      img.alt = text(show.title);
      img.loading = 'eager';
      img.decoding = 'async';
      const info = element('div', 'show_card_info-wrapper', card);
      element('div', 'show_title_small', info).textContent = text(show.title);
      const details = element('div', 'show_details_wrapper', info);
      // Icônes identiques aux cartes du catalogue Webflow.
      const icons = ["<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" viewBox=\"0 0 19 19\" fill=\"none\" class=\"show_detail_icon\"><path d=\"M7.8125 6.25V4.48373C7.8125 4.08224 8.05083 3.71638 8.43469 3.59867C9.84166 3.16722 12.3732 2.79478 14.9763 3.59692C15.3715 3.71871 15.625 4.09425 15.625 4.50781V8.55134C15.501 10.128 14.5089 13.2813 11.9048 13.2812C11.5823 13.2812 10.9375 13.2031 10.9375 12.8906\" stroke=\"currentColor\"></path><path d=\"M12.5 6.25C12.7604 6.51042 13.4375 6.875 14.0625 6.25\" stroke=\"currentColor\" stroke-linecap=\"round\"></path><path d=\"M13.2812 10.1562C12.8408 9.65764 11.8042 8.99035 10.7387 9.65231L10.5469 9.76562\" stroke=\"currentColor\" stroke-linecap=\"round\"></path><path d=\"M9.375 6.25C9.63542 6.51042 10.3125 6.875 10.9375 6.25\" stroke=\"currentColor\" stroke-linecap=\"round\"></path><path d=\"M7.22123 6.2018C4.25585 6.87952 2.1002 8.78113 1.24737 9.82802C1.17377 9.91836 1.16731 10.0437 1.22558 10.1446C2.73584 12.7604 4.18068 16.1138 7.16648 16.5705C7.86966 16.678 8.62517 16.5737 9.40338 16.1244C11.6587 14.8224 10.9412 11.5955 10.2602 10.1681L8.23848 6.6663C8.0317 6.30814 7.6244 6.10966 7.22123 6.2018Z\" stroke=\"currentColor\"></path><path d=\"M7.92969 9.25586C7.57395 9.16054 6.80529 9.18334 6.57652 10.0371\" stroke=\"currentColor\" stroke-linecap=\"round\"></path><path d=\"M5.93555 13.6152C6.68138 13.8654 8.2668 13.9031 8.64188 12.0527\" stroke=\"currentColor\" stroke-linecap=\"round\"></path><path d=\"M5.22266 10.8184C4.86692 10.723 4.09826 10.7458 3.86949 11.5996\" stroke=\"currentColor\" stroke-linecap=\"round\"></path></svg>", "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100%\" viewBox=\"0 0 20 20\" fill=\"none\" class=\"show_detail_icon\"><path d=\"M8.68561 16.4063L3.41766 11.1384C3.25603 10.9767 3.24669 10.724 3.3968 10.5739L9.32158 4.64913C9.41245 4.55825 9.5462 4.52231 9.67804 4.55331L14.3 5.05126C14.4592 5.08866 14.5873 5.21675 14.6247 5.37592L15.2707 10.1459C15.3016 10.2778 15.2657 10.4115 15.1748 10.5024L9.25007 16.4272C9.09996 16.5773 8.84725 16.568 8.68561 16.4063Z\" stroke=\"currentColor\"></path></svg>"];
      for (const [index, value] of [show.venue?.name, show.category].entries()) {
        if (!text(value)) continue;
        const row = element('div', 'show_detail_item', details);
        row.innerHTML = icons[index];
        row.firstElementChild.setAttribute('aria-hidden', 'true');
        element('div', 'show_detail_text text-style-2lines', row).textContent = text(value);
      }
      return {id: identifier(show), slug: slugOf(show), html: slide.outerHTML};
    }

    function buildSwiper(found, requestId) {
      const template = document.createElement('template');
      template.innerHTML = shellHtml || '<div class="ai_swiper_wrapper"><div class="swiper_wrapper"><div data-swiper-group class="swiper-group"><div data-swiper-wrap class="swiper w-dyn-list"><div role="list" class="swiper-wrapper w-dyn-items"></div></div></div></div></div>';
      const clone = template.content.firstElementChild;
      clone.removeAttribute('data-ai-search-swiper-source');
      clone.setAttribute('data-ai-search-result-swiper', '');
      clone.removeAttribute('hidden');
      clone.removeAttribute('aria-hidden');
      clone.style.removeProperty('display');
      for (const node of clone.querySelectorAll('[data-ai-search-swiper-source], .w-pagination-wrapper')) {
        if (node.hasAttribute('data-ai-search-swiper-source')) node.removeAttribute('data-ai-search-swiper-source');
        else node.remove();
      }
      const group = clone.matches('[data-swiper-group], .swiper-group') ? clone
        : clone.querySelector('[data-swiper-group], .swiper-group');
      const wrap = group?.querySelector('[data-swiper-wrap]');
      const list = wrap?.querySelector('.swiper-wrapper.w-dyn-items');
      if (!group || !wrap || !list) throw Error();
      group.setAttribute('data-swiper-group', '');
      for (const node of [group, wrap, list]) {
        node.removeAttribute('style');
        node.classList.remove('swiper-initialized', 'swiper-horizontal', 'swiper-vertical',
          'swiper-free-mode', 'swiper-backface-hidden', 'swiper-watch-progress', 'swiper-locked');
      }
      for (const node of clone.querySelectorAll('*')) {
        for (const attribute of [...node.attributes]) {
          if (attribute.name.startsWith('fs-list-')) node.removeAttribute(attribute.name);
        }
      }
      list.replaceChildren(...found.map(({ show, slide }, index) => {
        const card = cleanSlide(slide, show, requestId, index);
        card.setAttribute('data-ai-search-card-reveal', '');
        card.style.setProperty('--ai-card-delay', `${index * 115}ms`);
        return card;
      }));
      const prev = group.querySelector('[data-swiper-prev]');
      const next = group.querySelector('[data-swiper-next]');
      const pagination = group.querySelector('.swiper-pagination');
      pagination?.replaceChildren();
      const single = found.length === 1;
      for (const control of [prev, next, pagination]) {
        if (control && single) {
          control.hidden = true;
          control.style.setProperty('display', 'none', 'important');
        }
      }
      for (const button of [prev, next]) {
        if (!button) continue;
        button.classList.remove('swiper-button-disabled', 'swiper-button-lock', 'swiper-button-hidden');
        button.removeAttribute('disabled');
        button.removeAttribute('aria-disabled');
      }
      return { element: clone, wrap, prev, next, pagination, single };
    }

    async function appendReasons(parent, shows) {
      if (!shows.length) return;
      const list = document.createElement('ul');
      list.setAttribute('data-ai-search-reasons', '');
      parent.appendChild(list);
      for (const show of shows) {
        const item = document.createElement('li');
        const title = document.createElement('strong');
        const titleText = document.createTextNode('');
        const titleLabel = text(show.title) || slugOf(show) || 'Spectacle';
        const slug = slugOf(show);
        if (/^[a-z0-9][a-z0-9-]{0,199}$/i.test(slug)) {
          const link = document.createElement('a');
          link.setAttribute('href', trackedInternalHref(new URL(`/spectacles/${encodeURIComponent(slug)}`, catalogOrigin)));
          openInNewTab(link);
          link.appendChild(titleText);
          title.appendChild(link);
        } else {
          title.appendChild(titleText);
        }
        const reasonText = document.createTextNode('');
        item.append(title, reasonText);
        list.appendChild(item);
        await streamText(titleText, titleLabel, 20);
        await streamText(reasonText, ` : ${visitorText(show.reason, 'Ce spectacle pourrait vous plaire.')}`, 20);
      }
    }

    const render = async (reply, data, requestId, introDone) => {
      let results = data.results.filter(show => show && typeof show === 'object' && !Array.isArray(show));
      const detailMode = data.criteria?.conversation_mode === 'detail';
      if (detailMode) {
        const target = data.detail_target?.webflow_id;
        // Ne jamais deviner la première fiche d'une sélection ambiguë.
        results = target ? results.filter(show => (show.webflow_id || show.id) === target).slice(0, 1)
          : results.length === 1 ? results : [];
      }
      const showRecommendations = results.length > 0;
      const conclusion = !detailMode && results.length ? visitorText(data.conclusion) : '';
      const followUp = data.follow_up_question
        ? visitorText(data.follow_up_question, 'Pouvez-vous préciser ce que vous recherchez ?')
        : '';
      const showFollowUp = followUp && followUp !== conclusion && followUp !== visitorText(data.answer);
      const showFoundersImage = !foundersImageShown && data.status === 'ok'
        && data.criteria?.conversation_mode === 'knowledge'
        && data.criteria?.knowledge_scope === 'laffiche'
        && Array.isArray(data.criteria.knowledge_topics)
        && data.criteria.knowledge_topics.some(topic => foundersTopics.has(topic));
      // Les recommandations suivent le texte ; une fiche détaillée le précède.
      if (showRecommendations) reply.element.setAttribute('data-ai-search-has-cards', '');
      const layout = document.createElement('div');
      layout.setAttribute('data-ai-search-recommendations', '');
      let rendered = 0;
      let selected = [];
      let carousel = null;
      let catalogError = sourceError;

      const cardsReady = (async () => {
        if (detailMode && results.length === 1) {
          const slide = detailSlide(results[0]);
          if (slide) {
            selected = [{show: results[0], slide}];
            carousel = buildSwiper(selected, requestId);
            return;
          }
        }
        if (showRecommendations && !catalogError) {
          try {
            selected = await resolveSlides(results);
            const found = selected.filter(item => item.slide);
            if (found.length) carousel = buildSwiper(found, requestId);
          } catch (error) {
            catalogError = error;
            // Une page en erreur ne doit pas faire perdre les cartes déjà trouvées.
            selected = results.map(show => ({ show, slide: findSlide(show) }));
            const found = selected.filter(item => item.slide);
            try { if (found.length) carousel = buildSwiper(found, requestId); }
            catch (error) { catalogError = error; }
          }
        }
      })();
      await introDone;
      if (!showRecommendations && !conclusion && !showFollowUp && !showFoundersImage) return rendered;
      reply.element.appendChild(layout);
      queueResponseScroll();

      let cardsDone = Promise.resolve();
      if (showRecommendations) {
        const cardSlot = document.createElement('div');
        cardSlot.setAttribute('data-ai-search-card-slot', '');
        cardSlot.style.minWidth = '0';
        cardSlot.style.width = '100%';
        if (detailMode) reply.element.prepend(cardSlot);
        else layout.appendChild(cardSlot);
        cardsDone = (async () => {
          await cardsReady;
          if (carousel) {
            cardSlot.appendChild(carousel.element);
            queueResponseScroll();
            rendered = selected.filter(item => item.slide).length;
            await new Promise(resolve => requestAnimationFrame(resolve));
            if (typeof window.Swiper === 'function') {
              new window.Swiper(carousel.wrap, {
                slidesPerView: 'auto',
                spaceBetween: 16,
                speed: 300,
                freeMode: { enabled: true, sticky: true },
                grabCursor: false,
                allowTouchMove: !carousel.single,
                watchOverflow: true,
                a11y: false,
                navigation: carousel.single ? false : { prevEl: carousel.prev, nextEl: carousel.next },
                ...(!carousel.single && carousel.pagination ? { pagination: {
                  el: carousel.pagination, type: 'bullets', clickable: true,
                } } : {}),
              });
              carousel.wrap.swiper?.update();
              queueResponseScroll();
            } else {
              carousel.element.setAttribute('data-ai-search-swiper-status', 'missing-library');
            }
          } else if (!detailMode) {
            const fallback = document.createElement('p');
            fallback.setAttribute('data-ai-search-missing-cards', '');
            cardSlot.appendChild(fallback);
            const message = catalogError
              ? 'Les fiches ne s’affichent pas pour le moment. Retrouvez les suggestions ci-dessous.'
              : 'Certaines fiches ne s’affichent pas pour le moment. Retrouvez les suggestions ci-dessous.';
            const messageNode = document.createTextNode('');
            fallback.appendChild(messageNode);
            await streamText(messageNode, message, 20);
          }
          const missing = selected.filter(item => !item.slide);
          if (missing.length && carousel && !detailMode) {
            const notice = document.createElement('p');
            notice.setAttribute('data-ai-search-missing-cards', '');
            const noticeText = document.createTextNode('');
            notice.appendChild(noticeText);
            cardSlot.appendChild(notice);
            await streamText(noticeText, 'Certaines fiches ne s’affichent pas pour le moment. Retrouvez toutes les suggestions ci-dessous.', 20);
          }
        })();
        if (!detailMode) await appendReasons(layout, results);
      }
      if (conclusion) {
        const closing = document.createElement('p');
        closing.setAttribute('data-ai-search-conclusion', '');
        const conclusionText = document.createTextNode('');
        closing.appendChild(conclusionText);
        layout.appendChild(closing);
        await streamText(conclusionText, conclusion, 20);
      }
      if (showFollowUp) {
        const question = document.createElement('p');
        question.setAttribute('data-ai-search-follow-up', '');
        const questionText = document.createTextNode('');
        question.appendChild(questionText);
        layout.appendChild(question);
        await streamText(questionText, followUp, 20);
      }
      if (showFoundersImage) {
        const portrait = document.createElement('img');
        portrait.setAttribute('data-ai-search-founders-image', '');
        portrait.alt = 'Suzanne et Martin, fondateurs de L’Affiche';
        portrait.decoding = 'async';
        Object.assign(portrait.style, {
          display: 'block', width: '100%', maxWidth: '34rem', height: 'auto',
          alignSelf: 'flex-start', borderRadius: '0.75rem',
        });
        portrait.addEventListener('load', queueResponseScroll, { once: true });
        portrait.addEventListener('error', () => {
          portrait.remove();
          if (!layout.childElementCount) layout.remove();
        }, { once: true });
        portrait.src = foundersImageUrl;
        layout.appendChild(portrait);
        foundersImageShown = true;
        queueResponseScroll();
      }
      await cardsDone;
      if (!layout.childElementCount) layout.remove();
      return rendered;
    };
    render.prepareCatalog = prepareCatalog;
    render.stopPreparing = stopPreparing;
    return render;
  }

  function init(root) {
    if (root.hasAttribute('data-ai-search-initialized')) return;
    root.setAttribute('data-ai-search-script-version', SCRIPT_VERSION);
    const find = name => root.querySelector(`[data-ai-search-${name}]`);
    const form = find('form');
    const input = find('question');
    const submit = find('submit');
    const thread = find('thread');
    const suggestions = find('suggestions');
    const close = find('close');
    const divider = find('divider');
    const legalElements = root.querySelectorAll('[data-ai-search-legal]');
    const timers = root.querySelectorAll('[data-ai-search-timer]');
    const questionTemplate = root.querySelector('[data-ai-search-template="question"]');
    const answerTemplate = root.querySelector('[data-ai-search-template="answer"]');
    const loadingTextSource = root.matches('[data-ai-search-loading-text]') ? root : find('loading-text');
    const loadingPhrases = (loadingTextSource?.getAttribute('data-ai-search-loading-text') || '')
      .split('|').map(phrase => phrase.trim()).filter(Boolean);
    const loadingState = { last: '' };
    if (!form || !input || !submit || !thread || !suggestions
      || !questionTemplate?.querySelector('[data-ai-search-text]')
      || !answerTemplate?.querySelector('[data-ai-search-text]')) {
      form?.addEventListener('submit', event => event.preventDefault());
      return;
    }

    root.setAttribute('data-ai-search-initialized', '');
    root.setAttribute('data-ai-search-status', 'idle');
    root.setAttribute('aria-busy', 'false');
    const renderShowCards = createShowCardsRenderer(root, streamText, () => reducedMotion(), queueResponseScroll);
    // Les deux éléments Webflow deviennent les modèles ; ils ne sont pas affichés comme conversation.
    questionTemplate.remove();
    answerTemplate.remove();
    thread.replaceChildren();
    thread.setAttribute('role', 'log');
    thread.setAttribute('aria-label', 'Conversation avec L’Affiche');
    // Chaque réponse possède sa propre région live, pour ne pas relire tout le fil.
    thread.setAttribute('aria-live', 'off');
    close?.setAttribute('aria-label', 'Fermer la conversation');
    if (close?.tagName === 'BUTTON') close.type = 'button';
    if (!submit.getAttribute('aria-label')) submit.setAttribute('aria-label', 'Envoyer la question');
    if (!input.getAttribute('aria-label') && !input.labels?.length) input.setAttribute('aria-label', 'Votre question sur les spectacles');

    let busy = false;
    let turns = 0;
    let history = [];
    const currentConversationId = conversationId();
    root.setAttribute('data-ai-search-conversation-id', currentConversationId);
    let timerStartedAt = null;
    let elapsed = 0;
    let timerFrame = null;
    let sizeAnimation = null;
    let entranceAnimation = null;
    let currentState = null;
    let responseScrollFrame = null;
    let dismissingKeyboard = false;
    const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const mobileViewport = window.matchMedia('(max-width: 767px), (orientation: landscape) and (max-width: 991px) and (max-height: 600px)');
    const syncPlaceholder = animateQuestionPlaceholder(input, root, reducedMotion);

    const mirrorForms = Array.from(document.querySelectorAll('form[data-ai-search-mirror="hero"]'))
      .filter(element => !element.closest('[data-ai-search]'));
    const mirrorInputs = mirrorForms.map(element => element.querySelector('[data-ai-search-question]')).filter(Boolean);
    let forceHeroVisibility = () => {};
    const syncMirrors = () => {
      mirrorInputs.forEach(element => {
        element.value = input.value;
        element.dispatchEvent(new Event('ai-search:mirror-sync'));
      });
    };
    input.addEventListener('input', syncMirrors);
    mirrorForms.forEach(mirrorForm => {
      const mirrorInput = mirrorForm.querySelector('[data-ai-search-question]');
      if (!mirrorInput) return;
      mirrorInput.addEventListener('input', () => {
        input.value = mirrorInput.value;
        syncMirrors();
        syncPlaceholder();
      });
      // Capture avant les gestionnaires Webflow : un seul formulaire envoie la requête.
      mirrorForm.addEventListener('submit', event => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (busy || !mirrorInput.value.trim() || mirrorInput.value.trim().length > 2000) return;
        input.value = mirrorInput.value;
        forceHeroVisibility(true);
        // L'envoi depuis le hero ouvre aussi le plein écran mobile, sans rouvrir le clavier.
        if (mobileViewport.matches) {
          mirrorInput.blur();
          beginMobileEditing();
        }
        form.requestSubmit(submit);
      }, true);
      animateQuestionPlaceholder(mirrorInput, mirrorForm, () => reducedMotion());
    });


    function visible(element, show) {
      if (!element) return;
      element.hidden = !show;
      if (show) element.style.removeProperty('display');
      else element.style.setProperty('display', 'none', 'important');
    }

    function setExpanded(expanded) {
      root.setAttribute('data-ai-search-expanded', String(expanded));
    }

    function endMobileEditing() {
      if (!root.hasAttribute('data-ai-search-mobile-editing')) return;
      sizeAnimation?.cancel();
      entranceAnimation?.cancel();
      root.removeAttribute('data-ai-search-mobile-editing');
      root.removeAttribute('data-ai-search-keyboard-visible');
      for (const name of ['top', 'left', 'width', 'height']) {
        root.style.removeProperty(`--ai-search-vv-${name}`);
      }
      visible(divider, currentState === 'chat');
      root.querySelectorAll('[data-ai-search-close]').forEach(element => visible(element, currentState === 'chat'));
    }

    function syncMobileViewport() {
      if (!root.hasAttribute('data-ai-search-mobile-editing')) return;
      if (!mobileViewport.matches) { endMobileEditing(); return; }
      const viewport = window.visualViewport;
      root.style.setProperty('--ai-search-vv-top', `${viewport?.offsetTop ?? 0}px`);
      root.style.setProperty('--ai-search-vv-left', `${viewport?.offsetLeft ?? 0}px`);
      root.style.setProperty('--ai-search-vv-width', `${viewport?.width ?? window.innerWidth}px`);
      root.style.setProperty('--ai-search-vv-height', `${viewport?.height ?? window.innerHeight}px`);
      root.toggleAttribute('data-ai-search-keyboard-visible', Boolean(viewport
        && (viewport.height < 240 || viewport.height < window.innerHeight - 120)));
    }

    function beginMobileEditing() {
      if (!mobileViewport.matches) return false;
      const from = root.getBoundingClientRect();
      sizeAnimation?.cancel();
      entranceAnimation?.cancel();
      root.setAttribute('data-ai-search-mobile-editing', '');
      syncMobileViewport();
      visible(divider, currentState !== 'collapsed');
      root.querySelectorAll('[data-ai-search-close]').forEach(element => visible(element, true));
      if (!reducedMotion() && root.animate) {
        const to = root.getBoundingClientRect();
        entranceAnimation = root.animate([
          { clipPath: `inset(${from.top - to.top}px ${to.right - from.right}px ${to.bottom - from.bottom}px ${from.left - to.left}px round 16px)`, opacity: .9 },
          { clipPath: 'inset(0px round 0px)', opacity: 1 },
        ], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
      return true;
    }

    function onViewportChange() {
      if (root.hasAttribute('data-ai-search-mobile-editing')) syncMobileViewport();
      else if (document.activeElement === input) beginMobileEditing();
    }
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);

    function scrollLatest(force = false) {
      if (currentState !== 'chat') return;
      // Ne déplace pas un lecteur qui est remonté dans la conversation.
      const nearBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 100;
      if (force || nearBottom) thread.scrollTop = thread.scrollHeight;
    }

    function queueResponseScroll() {
      if (responseScrollFrame !== null) return;
      responseScrollFrame = requestAnimationFrame(() => {
        responseScrollFrame = null;
        scrollLatest(true);
      });
    }

    function setState(state, animate = true, force = false) {
      if (state === currentState && !force) return;
      const previousState = currentState;
      const fromHeight = root.getBoundingClientRect().height;
      sizeAnimation?.cancel();
      currentState = state;
      root.setAttribute('data-ai-search-state', state);
      setExpanded(state !== 'collapsed');
      visible(thread, state === 'chat');
      visible(suggestions, state !== 'collapsed');
      legalElements.forEach(element => visible(element, state !== 'collapsed'));
      visible(divider, state === 'chat' || root.hasAttribute('data-ai-search-mobile-editing'));
      root.querySelectorAll('[data-ai-search-close]').forEach(element => visible(element,
        state === 'chat' || root.hasAttribute('data-ai-search-mobile-editing')));
      input.setAttribute('aria-expanded', String(state !== 'collapsed'));
      syncPlaceholder();
      const toHeight = root.getBoundingClientRect().height;
      if (animate && !reducedMotion() && typeof root.animate === 'function' && fromHeight !== toHeight) {
        sizeAnimation = root.animate([
          { height: `${fromHeight}px`, overflow: 'hidden' },
          { height: `${toHeight}px`, overflow: 'hidden' },
        ], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
      }
      if (state === 'chat') {
        const updateSwipers = () => root.querySelectorAll('[data-ai-search-result-swiper] [data-swiper-wrap]')
          .forEach(element => element.swiper?.update());
        requestAnimationFrame(() => { scrollLatest(true); updateSwipers(); });
        if (previousState !== 'chat') setTimeout(updateSwipers, 280);
      }
    }

    function collapse() {
      endMobileEditing();
      if (root.contains(document.activeElement)) document.activeElement.blur();
      setState('collapsed', true, true);
      forceHeroVisibility(false);
    }

    function animateEntrance() {
      if (reducedMotion() || typeof root.animate !== 'function') return;
      const computed = window.getComputedStyle(root);
      const baseTransform = computed.transform === 'none' ? '' : `${computed.transform} `;
      const baseFilter = computed.filter === 'none' ? '' : `${computed.filter} `;
      entranceAnimation = root.animate([
        { opacity: 0, transform: `${baseTransform}translateY(56px) scale(0.8)`, filter: `${baseFilter}blur(20px)`, transformOrigin: '50% 100%' },
        { opacity: 1, transform: `${baseTransform}translateY(0) scale(1)`, filter: `${baseFilter}blur(0px)`, transformOrigin: '50% 100%' },
      ], { delay: 1500, duration: 700, fill: 'backwards', easing: 'cubic-bezier(.16,1,.3,1)' });
    }

    function watchHeroVisibility() {
      const hero = document.querySelector('[data-ai-hero]');
      if (!hero || typeof IntersectionObserver !== 'function') {
        animateEntrance();
        return;
      }

      const computed = window.getComputedStyle(root);
      const baseTransform = computed.transform === 'none' ? '' : `${computed.transform} `;
      const baseFilter = computed.filter === 'none' ? '' : `${computed.filter} `;
      let motion = null;
      let shown = null;
      const originalVisibility = root.style.getPropertyValue('visibility');
      const originalPriority = root.style.getPropertyPriority('visibility');
      const originalInert = root.inert;
      const restoreVisibility = () => {
        if (originalVisibility) root.style.setProperty('visibility', originalVisibility, originalPriority);
        else root.style.removeProperty('visibility');
      };
      const setShown = (show, initial = false) => {
        if (shown === show) return;
        shown = show;
        root.inert = show ? originalInert : true;
        if (!show && root.contains(document.activeElement)) {
          document.activeElement.blur();
          endMobileEditing();
        }
        if (initial && !show || reducedMotion() || typeof root.animate !== 'function') {
          motion?.cancel();
          motion = null;
          if (show) restoreVisibility();
          else root.style.setProperty('visibility', 'hidden', 'important');
          return;
        }
        restoreVisibility();
        if (!motion) {
          motion = root.animate([
            { opacity: 0, transform: `${baseTransform}translateY(56px) scale(0.8)`, filter: `${baseFilter}blur(20px)`, transformOrigin: '50% 100%' },
            { opacity: 1, transform: `${baseTransform}translateY(0) scale(1)`, filter: `${baseFilter}blur(0px)`, transformOrigin: '50% 100%' },
          ], { duration: 700, fill: 'both', easing: 'cubic-bezier(.16,1,.3,1)' });
          motion.pause();
          motion.currentTime = show ? 0 : 700;
          motion.onfinish = () => {
            if (!shown) root.style.setProperty('visibility', 'hidden', 'important');
          };
        }
        // Inverser la même animation permet de gérer les changements rapides de sens.
        // Garder un départ réactif dans les deux sens, sans délai.
        // Une lecture inversée exige aussi d'inverser la courbe temporelle.
        motion.effect.updateTiming({
          easing: show ? 'cubic-bezier(.16,1,.3,1)' : 'cubic-bezier(.7,0,.84,0)',
        });
        motion.playbackRate = show ? 1 : -1;
        motion.play();
      };
      const rect = hero.getBoundingClientRect();
      const intersects = rect.bottom > 0 && rect.top < window.innerHeight
        && rect.right > 0 && rect.left < window.innerWidth;
      let heroVisible = intersects;
      let forced = false;
      forceHeroVisibility = value => {
        forced = value;
        setShown(forced || !heroVisible);
      };
      setShown(!heroVisible, true);
      const observer = new IntersectionObserver(entries => {
        heroVisible = entries[entries.length - 1].isIntersecting;
        setShown(forced || !heroVisible);
      }, { threshold: 0 });
      observer.observe(hero);
    }

    function renderTimer() {
      timers.forEach(element => { element.textContent = formatDuration(elapsed); });
    }
    function tick() {
      if (timerStartedAt === null) return;
      elapsed = performance.now() - timerStartedAt;
      renderTimer();
      timerFrame = requestAnimationFrame(tick);
    }
    function stopTimer() {
      if (timerStartedAt !== null) elapsed = performance.now() - timerStartedAt;
      timerStartedAt = null;
      if (timerFrame !== null) cancelAnimationFrame(timerFrame);
      timerFrame = null;
      renderTimer();
      return elapsed;
    }
    function startTimer(startedAt) {
      stopTimer();
      timerStartedAt = startedAt;
      elapsed = 0;
      renderTimer();
      timerFrame = requestAnimationFrame(tick);
    }

    function bubble(role, text, requestId) {
      const element = (role === 'user' ? questionTemplate : answerTemplate).cloneNode(true);
      element.removeAttribute('data-ai-search-template');
      element.removeAttribute('hidden');
      element.removeAttribute('id');
      element.querySelectorAll('[id]').forEach(child => child.removeAttribute('id'));
      element.setAttribute('data-ai-search-message', role);
      element.setAttribute('data-ai-search-turn', String(requestId));
      const content = element.querySelector('[data-ai-search-text]');
      content.textContent = text;
      if (role === 'assistant') {
        content.setAttribute('role', 'status');
        content.setAttribute('aria-live', 'polite');
        content.setAttribute('aria-atomic', 'true');
      }
      thread.appendChild(element);
      if (!reducedMotion() && typeof element.animate === 'function') {
        element.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 200, easing: 'ease-out' });
      }
      scrollLatest(true);
      return { element, content };
    }

    function renderLoadingText(reply, text) {
      if (reducedMotion()) {
        reply.content.removeAttribute('aria-label');
        reply.content.textContent = text;
        return;
      }
      const letters = typeof Intl.Segmenter === 'function'
        ? Array.from(new Intl.Segmenter('fr', { granularity: 'grapheme' }).segment(text), part => part.segment)
        : Array.from(text);
      const visual = document.createElement('span');
      visual.setAttribute('data-ai-search-loading-visual', '');
      visual.setAttribute('aria-hidden', 'true');
      reply.content.setAttribute('aria-label', text);
      reply.content.style.setProperty('--ai-loading-cycle', `${Math.max(1800, letters.length * 32 + 700)}ms`);
      letters.forEach((letter, index) => {
        if (/^\s+$/.test(letter)) {
          visual.appendChild(document.createTextNode(letter));
          return;
        }
        const span = document.createElement('span');
        span.setAttribute('data-ai-search-loading-letter', '');
        span.style.setProperty('--ai-loading-delay', `${index * 32}ms`);
        span.textContent = letter;
        visual.appendChild(span);
      });
      reply.content.replaceChildren(visual);
    }

    function stopLoadingText(reply) {
      const visual = reply.content.querySelector('[data-ai-search-loading-visual]');
      if (visual) reply.content.replaceChildren(document.createTextNode(visual.textContent));
      reply.content.removeAttribute('aria-label');
      reply.content.style.removeProperty('--ai-loading-cycle');
    }

    // N'ajoute que les mots déjà lus : aucune ligne ou puce invisible ne réserve
    // sa place dans le fil. Les nœuds texte conservent les styles natifs des liens.
    function streamText(node, value, msPerWord = 20) {
      const content = String(value ?? '');
      if (!content || reducedMotion()) {
        node.nodeValue = content;
        scrollLatest(true);
        return Promise.resolve();
      }
      const chunks = content.match(/\s*\S+|\s+/gu) || [];
      if (!chunks.length) return Promise.resolve();
      const first = chunks.shift();
      node.nodeValue = first;
      scrollLatest(true);
      if (!chunks.length) return Promise.resolve();
      return new Promise(resolve => {
        const start = performance.now();
        let shown = 0;
        const tick = now => {
          const next = Math.min(chunks.length, Math.floor((now - start) / msPerWord));
          if (next > shown) {
            node.nodeValue += chunks.slice(shown, next).join('');
            shown = next;
            scrollLatest(true);
          }
          if (shown < chunks.length) requestAnimationFrame(tick);
          else resolve();
        };
        requestAnimationFrame(tick);
      });
    }

    function publicError(error) {
      if (error.name === 'AbortError') return 'La recherche prend plus de temps que prévu. Réessayez dans un instant.';
      if (error.status === 404) return 'Je ne peux pas lancer la recherche pour le moment. Réessayez plus tard.';
      if (error.status === 429) return 'Il y a beaucoup de demandes en ce moment. Réessayez dans quelques instants.';
      if (error.status >= 500) return 'Je n’arrive pas à préparer votre sélection pour le moment. Réessayez dans quelques instants.';
      if (error.code === 'network') return 'Je n’arrive pas à lancer la recherche pour le moment. Réessayez dans quelques instants.';
      return 'Je n’arrive pas à préparer votre sélection pour le moment. Réessayez dans un instant.';
    }

    function setBusy(value) {
      busy = value;
      submit.disabled = value;
      mirrorForms.forEach(element => {
        const button = element.querySelector('[data-ai-search-submit]');
        if (button) button.disabled = value;
        element.setAttribute('aria-busy', String(value));
      });
      root.setAttribute('aria-busy', String(value));
      root.querySelectorAll('[data-ai-search-suggest]').forEach(element => {
        element.setAttribute('aria-disabled', String(value));
        if ('disabled' in element) element.disabled = value;
      });
    }

    input.addEventListener('focus', () => {
      const fullScreen = beginMobileEditing();
      setState(turns ? 'chat' : 'suggestions', !fullScreen);
    });
    // Un clic dans les bulles, les liens ou les boutons garde le composant ouvert.
    // La navigation au clavier vers un élément extérieur le ferme.
    root.addEventListener('focusout', event => {
      if (dismissingKeyboard) return;
      if (event.relatedTarget && !root.contains(event.relatedTarget)) collapse();
    });
    // Capture le clic, y compris sur le SVG et sur un bouton ajouté après init,
    // avant les gestionnaires parents pouvant rouvrir le composant.
    root.addEventListener('click', event => {
      const trigger = event.target.closest?.('[data-ai-search-close]');
      if (!trigger || !root.contains(trigger)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      collapse();
    }, true);
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && currentState !== 'collapsed') {
        event.preventDefault();
        collapse();
      }
    });
    document.addEventListener('pointerdown', event => {
      if (root.contains(event.target)) return;
      if (currentState !== 'collapsed') collapse();
    }, true);

    root.querySelectorAll('[data-ai-search-suggest]').forEach(element => {
      const native = element.tagName === 'BUTTON';
      if (native) element.type = 'button';
      else {
        element.setAttribute('role', 'button');
        element.tabIndex = 0;
      }
      const activate = event => {
        event.preventDefault();
        if (busy) return;
        const prompt = (element.getAttribute('data-ai-search-suggest') || element.textContent).replace(/\s+/g, ' ').trim();
        if (!prompt) return;
        input.value = prompt;
        input.focus({ preventScroll: true });
        form.requestSubmit(submit);
      };
      element.addEventListener('click', activate);
      if (!native) element.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activate(event);
      });
    });

    form.addEventListener('submit', async event => {
      const startedAt = performance.now();
      event.preventDefault();
      event.stopPropagation();
      if (busy) return;
      const text = input.value.trim();
      if (!text) { input.focus(); return; }
      if (text.length > 2000) { input.focus(); return; }
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: 'chatbot_question' });
      const requestId = ++turns;
      // Retirer les suggestions dès le premier envoi valide, pour toute la conversation.
      root.querySelectorAll('[data-ai-search-suggestions], .ai_suggest_wrapper, [data-ai-search-divider]')
        .forEach(element => element.remove());
      const previousHistory = history.slice(-20);
      bubble('user', text, requestId);
      let loadingMessages = shuffleLoadingMessages(loadingPhrases, loadingState.last);
      let loadingIndex = 0;
      loadingState.last = loadingMessages[loadingIndex] || '';
      const reply = bubble('assistant', loadingState.last, requestId);
      reply.element.setAttribute('data-ai-search-loading', '');
      reply.content.setAttribute('data-ai-search-loading-text', '');
      renderLoadingText(reply, loadingState.last);
      setState('chat');
      if (root.hasAttribute('data-ai-search-mobile-editing') && document.activeElement === input) {
        dismissingKeyboard = true;
        input.blur();
        dismissingKeyboard = false;
      }
      input.value = '';
      syncMirrors();
      setBusy(true);
      renderShowCards.prepareCatalog();
      root.setAttribute('data-ai-search-status', 'loading');
      startTimer(startedAt);
      const loadingInterval = setInterval(() => {
        if (loadingMessages.length < 2) return;
        loadingIndex++;
        if (loadingIndex === loadingMessages.length) {
          loadingMessages = shuffleLoadingMessages(loadingPhrases, loadingState.last);
          loadingIndex = 0;
        }
        loadingState.last = loadingMessages[loadingIndex] || '';
        renderLoadingText(reply, loadingState.last);
      }, 5000);
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, TIMEOUT_MS);

      try {
        let response;
        try {
          response = await fetch(URLS[MODE], {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation_id: currentConversationId, question: text, history: previousHistory }),
            signal: controller.signal,
          });
        } catch (cause) {
          if (cause.name === 'AbortError') throw cause;
          throw Object.assign(Error(), { code: 'network' });
        }
        const body = await response.text();
        renderShowCards.stopPreparing();
        clearInterval(loadingInterval);
        stopLoadingText(reply);
        if (!response.ok) throw Object.assign(Error(), { status: response.status });
        let json;
        try { json = JSON.parse(body); }
        catch { throw Error(); }
        const data = json?.response || json;
        if (!data || typeof data !== 'object' || !Array.isArray(data.results) || !Array.isArray(data.alternatives)) {
          throw Error();
        }
        if (data.conversation_id && data.conversation_id !== currentConversationId) {
          throw Error();
        }
        if (data.status === 'error') throw Error();
        const onlyAlternatives = !data.results.length && data.alternatives.length > 0;
        const introFallback = data.results.length
          ? data.results.length === 1
            ? 'Voici un spectacle qui pourrait vous plaire.'
            : `Voici ${data.results.length} spectacles qui pourraient vous plaire.`
          : 'Je n’ai pas trouvé de spectacle pour cette recherche. Essayez une autre date ou précisez vos envies.';
        const intro = onlyAlternatives ? introFallback : visitorText(data.answer, introFallback,
          data.criteria?.conversation_mode === 'detail' ? 6000 : 2000);
        const introNode = document.createTextNode('');
        reply.content.replaceChildren(introNode);
        if (data.criteria?.conversation_mode === 'detail') reply.content.style.whiteSpace = 'pre-line';
        reply.content.setAttribute('aria-busy', 'true');
        const introDone = streamText(introNode, intro, 28)
          .then(() => linkDetailTitle(reply.content, data))
          .finally(() => reply.content.removeAttribute('aria-busy'));
        reply.element.setAttribute('data-ai-search-response-status', (onlyAlternatives ? 'no_results' : data.status) || 'success');
        await renderShowCards(reply, data, requestId, introDone);
        // Le tour suivant reçoit les critères et les raisons, même si le rendu animé continue.
        history = [...history, { role: 'user', content: text }, { role: 'assistant', content: assistantMemory(onlyAlternatives ? {...data, answer: intro} : data) }].slice(-20);
        root.setAttribute('data-ai-search-status', 'success');
        // Événement conservé pour d’autres intégrations ; les cartes sont déjà rendues.
        root.dispatchEvent(new CustomEvent('ai-search:response', {
          bubbles: true, detail: { requestId, question: text, data, responseElement: reply.element },
        }));
      } catch (error) {
        clearInterval(loadingInterval);
        stopLoadingText(reply);
        const errorNode = document.createTextNode('');
        reply.content.replaceChildren(errorNode);
        await streamText(errorNode, publicError(error), 25);
        reply.element.setAttribute('data-ai-search-response-status', 'error');
        root.setAttribute('data-ai-search-status', 'error');
        if (!input.value.trim()) { input.value = text; syncMirrors(); }
      } finally {
        renderShowCards.stopPreparing();
        stopTimer();
        clearInterval(loadingInterval);
        stopLoadingText(reply);
        clearTimeout(timeout);
        reply.element.removeAttribute('data-ai-search-loading');
        reply.content.removeAttribute('data-ai-search-loading-text');
        setBusy(false);
        scrollLatest(true);
      }
    });

    renderTimer();
    setState(document.activeElement === input ? 'suggestions' : 'collapsed', false);
    watchHeroVisibility();
    // Autoriser le premier affichage seulement après application de la condition du hero.
    root.setAttribute('data-ai-search-visibility-ready', '');
  }

  const boot = () => document.querySelectorAll('[data-ai-search]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
