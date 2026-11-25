/* TCO Présences — application du service d'accueil
   Pointage des cultes et rencontres, rappels après 2 absences successives sans excuse,
   bilans mensuels, trimestriels et annuels, grand bilan (membres × rencontres). */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const NATIVE = window.TCOAndroid || null;
  // Masque l'aperçu de l'application dans les applications récentes (et bloque les captures) quand un code d'accès est actif
  const setSecure = (on) => { try { if (NATIVE && NATIVE.setSecure) NATIVE.setSecure(!!on); } catch (e) { /* ancienne version */ } };

  /* ---------- Outils ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => isoDate(new Date());
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, opts) => parseDate(s).toLocaleDateString('fr-FR', opts || { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = (s) => parseDate(s).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const MONTH_INI = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const pct = (x) => (x == null ? '—' : Math.round(x * 100) + ' %');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const fullName = (m) => `${m.prenoms} ${m.nom}`.trim();
  const initials = (m) => ((m.prenoms || ' ')[0] + (m.nom || ' ')[0]).toUpperCase().trim();
  const TYPES = { dimanche: 'Culte du dimanche', semaine: 'Culte de semaine', special: 'Culte spécial' };
  // Deux assemblées le dimanche (français puis Jula Moré) et des cultes communs (Noël, journées ASC, JAD…)
  const CULTES = { fr: 'Culte en français', jm: 'Culte Jula Moré', commun: 'Culte commun' };
  const CULTE_SHORT = { fr: 'Français', jm: 'Jula Moré' };
  const svcA = (s) => s.assemblee || 'commun';
  // Rencontres : culte (dimanche/commun), enseignement du mercredi soir, prière du vendredi soir, journées spéciales
  const KINDS = { culte: 'Cultes', enseignement: 'Enseignement du mercredi soir', priere: 'Prière du vendredi soir', activite: 'Journées spéciales' };
  const svcKind = (s) => s.kind || 'culte';
  const svcName = (s) => {
    const k = svcKind(s);
    if (k === 'activite') return s.label || 'Journée spéciale';
    if (k !== 'culte') return KINDS[k] + (s.label ? ' · ' + s.label : '');
    return s.assemblee ? CULTES[s.assemblee] + (s.label ? ' · ' + s.label : '') : (s.label || TYPES[s.type] || 'Culte');
  };
  const timeRange = (s) => s.time ? (s.timeEnd ? `${s.time}–${s.timeEnd}` : s.time) : '';
  // Culte d'appartenance à une date donnée : un transfert daté ne réécrit pas l'historique.
  const culteAt = (m, date) => {
    const h = m.culteHistory;
    if (!h || !h.length) return m.culte || '';
    let c = h[0].culte;
    for (const x of h) if (x.from <= date) c = x.culte;
    return c;
  };
  // Le membre appartient-il à ce culte à cette date ? (culte commun = tout le monde)
  const strictBelongs = (m, s) => svcA(s) === 'commun' || culteAt(m, s.date) === svcA(s);
  // Affiché au pointage : son culte, ou partout tant que son culte n'est pas précisé
  const belongs = (m, s) => strictBelongs(m, s) || !culteAt(m, s.date);
  // Périodes où le membre était parti (il n'est ni présent ni absent pendant ce temps)
  const departs = (m) => m.departs || (m.partiLe ? [{ from: m.partiLe, to: null }] : []);
  const away = (m, date) => departs(m).some((d) => date > d.from && (!d.to || date < d.to));
  // Nombre saisi à la main (non enregistrés, enfants)
  const num = (v) => Math.max(0, Math.floor(Number(v) || 0));
  const extras = (s) => ({ v: num(s.visiteurs), e: num(s.enfants) });
  const telHref = (t) => String(t || '').replace(/[^\d+]/g, '');

  const ICON = {
    check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    gear: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    phone: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    msg: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>',
    camera: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };

  // Logo officiel du TCO (chandelier d'or)
  const LOGO = '<img class="logo" src="logo.png" alt="">';
  const KICKER = `<div class="kicker brandline"><span class="logobox">${LOGO}</span>TCO · Service d'accueil</div>`;

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function photoHtml(m, size) {
    const p = m && DB.get('photos', m.id);
    const label = m ? `Photo de ${esc(fullName(m))}` : 'Photo';
    if (p && p.data) return `<div class="ph ph${size}"><img src="${esc(p.data)}" alt="${label}"></div>`;
    return `<div class="ph ph${size}" role="img" aria-label="${label} (pas encore de photo)">${m ? esc(initials(m)) : ''}</div>`;
  }

  /* ---------- Données dérivées ---------- */
  const byName = (a, b) => norm(a.nom + ' ' + a.prenoms).localeCompare(norm(b.nom + ' ' + b.prenoms));
  const allMembers = () => DB.list('members').sort(byName);
  const activeMembers = () => allMembers().filter((m) => m.actif !== false);
  const svcKey = (s) => `${s.date}T${s.time || '00:00'}`;
  const services = () => DB.list('services').sort((a, b) => svcKey(a).localeCompare(svcKey(b)));
  const openService = () => services().filter((s) => !s.closed).pop() || null;
  const presence = (sid, mid) => DB.get('presences', `${sid}|${mid}`);
  // Un membre n'est compté (présent ou absent) qu'à partir de sa date d'arrivée à l'église.
  const arrival = (m) => m.dateArrivee || m.createdAt || '0000';
  // Visible au pointage dès le jour de son arrivée…
  const listable = (m, s) => arrival(m) <= s.date && belongs(m, s);
  // …mais compté dans les statistiques à partir des rencontres suivantes. Le jour même ne compte que s'il a été pointé (présent ou excusé).
  // Un membre n'est compté que pour les cultes de son assemblée (à la date du culte) et les rencontres communes,
  // et jamais pendant une période où il était parti.
  const eligible = (m, s) => {
    const a = arrival(m);
    if (a > s.date || away(m, s.date)) return false;
    const p = DB.get('presences', `${s.id}|${m.id}`);
    const pointed = !!p && (p.status === 'P' || p.status === 'E');
    if (!strictBelongs(m, s)) return !culteAt(m, s.date) && pointed;
    if (a < s.date) return true;
    return pointed;
  };
  // Cultes comptés : bilans des cultes, règle des 2 absences, fiche membre
  const countedClosed = () => services().filter((s) => s.closed && s.counted && svcKind(s) === 'culte');
  // Règle des 2 absences : uniquement les cultes comptés du dimanche
  const isSunday = (d) => new Date(d + 'T12:00:00').getDay() === 0;
  const rappelCulte = (s) => !!s.counted && svcKind(s) === 'culte' && isSunday(s.date);
  const rappelClosed = () => countedClosed().filter((s) => isSunday(s.date));

  function lastCountedStatus(m, beforeService) {
    const list = rappelClosed().filter((s) => eligible(m, s) && (!beforeService || svcKey(s) < svcKey(beforeService)));
    const s = list.pop();
    if (!s) return null;
    const p = presence(s.id, m.id);
    return p ? p.status : 'A';
  }

  // Une absence excusée reste une absence dans les statistiques (elle est seulement signalée « excusée »).
  function memberStats(m, list) {
    let P = 0, A = 0, E = 0;
    for (const s of list) {
      if (!eligible(m, s)) continue;
      const p = presence(s.id, m.id);
      const st = p ? p.status : 'A';
      if (st === 'P') P++; else if (st === 'E') E++; else A++;
    }
    const denom = P + A + E;
    return { P, A, E, abs: A + E, denom, rate: denom ? P / denom : null };
  }

  const openAlerts = () => DB.list('alerts').filter((a) => a.status === 'open');
  function updateBadge() {
    const n = openAlerts().length;
    const b = document.getElementById('badge');
    b.hidden = !n; b.textContent = n > 99 ? '99+' : n;
  }

  /* ---------- Fichiers (export / impression) ---------- */
  function saveText(name, mime, text) {
    if (NATIVE && NATIVE.saveText) {
      const where = NATIVE.saveText(name, mime, text);
      toast(where ? `Fichier enregistré : ${where}` : "Impossible d'enregistrer le fichier");
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function printPage(title, landscape) {
    if (NATIVE && landscape && NATIVE.printPageLandscape) NATIVE.printPageLandscape(title);
    else if (NATIVE && NATIVE.printPage) NATIVE.printPage(title);
    else window.print();
  }
  // Un texte commençant par = + - @ serait lu comme une formule par Excel : on le neutralise
  const csvCell = (v) => { let s = String(v == null ? '' : v); if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');

  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Image illisible'));
        img.onload = () => {
          const max = 480;
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.8));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function savePhoto(memberId, data) {
    const old = DB.get('photos', memberId);
    const history = (old && old.history) || [];
    history.push(today());
    await DB.put('photos', { memberId, data, updatedAt: today(), history });
  }

  /* ---------- Routeur ---------- */
  let ready = false; // vrai quand les données sont chargées
  const ui = { q: '', filter: 'all', mq: '', closeArmed: false, lastClose: null, rTab: 'open', editing: null, kind: 'Appel',
    bMode: 'month', bMonth: null, bYear: null, formPhoto: null, leaveArmed: false };

  function route() {
    const h = location.hash.replace(/^#\/?/, '') || 'pointage';
    const [path, query] = h.split('?');
    const parts = path.split('/');
    return { name: parts[0], id: parts[1], query: new URLSearchParams(query || '') };
  }
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }

  function render() {
    const r = route();
    const tab = { pointage: 'pointage', nouveau: 'pointage', reglages: 'pointage', rappels: 'rappels', membres: 'membres', membre: 'membres', modifier: 'membres', bilans: 'bilans', journees: 'pointage', rencontre: 'pointage', historique: 'pointage', grandbilan: 'bilans' }[r.name] || 'pointage';
    document.querySelectorAll('#tabbar a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateBadge();
    const views = { pointage: viewPointage, rappels: viewRappels, membres: viewMembres, membre: viewFiche, nouveau: viewForm, modifier: viewForm, bilans: viewBilans, reglages: viewReglages, journees: viewJournees, rencontre: viewRencontre, historique: viewHistorique, grandbilan: viewGrandBilan };
    (views[r.name] || viewPointage)(r);
  }

  /* ================= POINTAGE ================= */
  const counter = (field, label, hint, val) => `<div class="row between" style="gap:10px">
      <label for="cnt-${field}" style="margin:0;color:var(--ink);font-size:15px;font-weight:700;flex:1">${label}${hint ? `<span class="small muted" style="display:block;font-weight:400">${hint}</span>` : ''}</label>
      <div class="row" style="gap:6px">
        <button type="button" class="btn ghost sm cntbtn" data-act="cnt" data-f="${field}" data-d="-1" aria-label="Retirer 1 : ${label}">−</button>
        <input id="cnt-${field}" data-cnt="${field}" type="number" inputmode="numeric" min="0" value="${val}" class="cntin">
        <button type="button" class="btn ghost sm cntbtn" data-act="cnt" data-f="${field}" data-d="1" aria-label="Ajouter 1 : ${label}">+</button>
      </div></div>`;

  function viewPointage() {
    const s = openService();
    if (!s) return viewOuvrir();
    const x = extras(s);
    $app.innerHTML = `
      <header class="head">
        <div class="row between">${KICKER}
          <a class="iconbtn noprint" href="#/reglages" aria-label="Réglages" style="color:#fff">${ICON.gear}</a></div>
        <div class="row between" style="align-items:flex-end"><h1>${svcKind(s) === 'culte' ? 'Pointage du culte' : 'Pointage'}</h1>
          <a href="#/rencontre/${s.id}" style="color:#fff;font-weight:700;font-size:15px;padding:10px 0 10px 12px">Modifier</a></div>
        <div class="sub">${esc(cap(fmtDate(s.date)))}${s.time ? ' · ' + esc(timeRange(s)) : ''}</div>
        <div class="sub small">${esc(svcName(s))}${svcA(s) === 'commun' ? ' · tous les membres' : ''}${svcKind(s) === 'culte' && !s.counted ? ' · non compté dans les bilans' : ''}</div>
        <div class="pills" id="pcounts"></div>
      </header>
      <div class="wrap" style="padding-bottom:4px">
        <section class="card" style="display:flex;flex-direction:column;gap:10px;padding:12px 14px">
          ${counter('visiteurs', 'Membres non enregistrés', 'Visiteurs, première visite, de passage', x.v)}
          ${counter('enfants', 'Enfants', '', x.e)}
          <p class="small muted" style="margin:0">Ces nombres s’ajoutent au total des présents, sans compter dans les présences des membres.</p>
        </section>
        <div class="row between">
          <label for="q" style="margin:0">Rechercher un membre</label>
          <a class="btn soft sm" href="#/nouveau?from=pointage">${ICON.plus}Nouveau membre</a>
        </div>
        <input id="q" type="search" placeholder="Nom ou prénom" value="${esc(ui.q)}" autocomplete="off">
        <div class="seg" role="group" aria-label="Filtrer la liste" id="pfilters"></div>
      </div>
      <div class="wrap" style="padding-top:6px"><ul class="list" id="plist"></ul></div>
      <div class="foot" id="pfoot"></div>`;
    document.getElementById('q').addEventListener('input', (e) => { ui.q = e.target.value; drawPointage(); });
    drawPointage();
  }

  async function saveCount(field, value) {
    const s = openService(); if (!s) return;
    await DB.put('services', Object.assign({}, s, { [field]: num(value) }));
    const inp = document.getElementById('cnt-' + field);
    if (inp && Number(inp.value) !== num(value)) inp.value = num(value);
    drawPointage();
  }

  function drawPointage() {
    const s = openService(); if (!s) return;
    const members = activeMembers().filter((m) => listable(m, s));
    const st = (m) => { const p = presence(s.id, m.id); return p ? p.status : null; };
    const nP = members.filter((m) => st(m) === 'P').length;
    const nE = members.filter((m) => st(m) === 'E').length;
    const nRest = members.length - nP - nE;
    const nAbs = members.filter((m) => !st(m) && strictBelongs(m, s)).length;
    const x = extras(s);
    document.getElementById('pcounts').innerHTML =
      `<span class="pill">${nP} membre${nP > 1 ? 's' : ''} présent${nP > 1 ? 's' : ''}</span><span class="pill outline">${nRest} non pointé${nRest > 1 ? 's' : ''}</span>${nE ? `<span class="pill outline">${nE} excusé${nE > 1 ? 's' : ''}</span>` : ''}${x.v + x.e ? `<span class="pill">Total : ${nP + x.v + x.e}</span>` : ''}`;
    const filters = [['all', 'Tous'], ['out', 'Non pointés'], ['in', 'Présents'], ['exc', 'Excusés']];
    document.getElementById('pfilters').innerHTML = filters.map(([k, l]) =>
      `<button type="button" data-act="filter" data-k="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join('');
    const q = norm(ui.q);
    const shown = members.filter((m) => {
      if (q && !norm(fullName(m) + ' ' + m.nom + ' ' + (m.tel || '')).includes(q)) return false;
      const y = st(m);
      return ui.filter === 'all' || (ui.filter === 'in' && y === 'P') || (ui.filter === 'out' && !y) || (ui.filter === 'exc' && y === 'E');
    });
    const list = document.getElementById('plist');
    if (!members.length) {
      list.innerHTML = `<li class="empty">Aucun membre enregistré.<br><br><a class="btn primary" href="#/nouveau?from=pointage">${ICON.plus}Ajouter le premier membre</a></li>`;
    } else if (!shown.length) {
      list.innerHTML = '<li class="empty">Aucun membre ne correspond.</li>';
    } else {
      list.innerHTML = shown.map((m) => {
        const y = st(m);
        const c = culteAt(m, s.date);
        const prev = rappelCulte(s) ? lastCountedStatus(m, s) : null;
        const info = [svcA(s) === 'commun' && c ? esc(CULTE_SHORT[c]) : '', m.zone ? 'Zone ' + esc(m.zone) : '', !c ? '<span class="tag grey">culte à préciser</span>' : '', prev === 'A' ? '<span class="tag warn">absent au culte précédent</span>' : ''].filter(Boolean).join(' · ');
        const main = y === 'P'
          ? `<button type="button" class="btn primary sm" data-act="mark" data-id="${m.id}" aria-pressed="true" aria-label="Retirer ${esc(fullName(m))} des présents">${ICON.check}Présent</button>`
          : y === 'E'
            ? `<button type="button" class="btn sm" style="background:#E3E1DA" data-act="mark" data-id="${m.id}" aria-label="Pointer ${esc(fullName(m))} présent">Excusé</button>`
            : `<button type="button" class="btn ghost sm" data-act="mark" data-id="${m.id}" aria-pressed="false" aria-label="Pointer ${esc(fullName(m))} présent">Pointer</button>`;
        const sec = y === 'E' ? 'Annuler l\'excuse' : 'Excuser';
        return `<li class="mrow">
          ${photoHtml(m, 72)}
          <a class="who" href="#/membre/${m.id}"><span class="name">${esc(fullName(m))}</span><span class="info">${info || '&nbsp;'}</span></a>
          <div class="mark">${main}<button type="button" class="linkbtn" data-act="excuse" data-id="${m.id}">${sec}</button></div>
        </li>`;
      }).join('');
    }
    const foot = document.getElementById('pfoot');
    foot.innerHTML = ui.closeArmed
      ? `<button type="button" class="btn ghost" style="flex:1" data-act="close-cancel">Annuler</button>
         <button type="button" class="btn dark" style="flex:2" data-act="close-confirm">Confirmer : ${nAbs} absent${nAbs > 1 ? 's' : ''}</button>`
      : `<button type="button" class="btn dark block" data-act="close-arm">Clôturer le pointage</button>`;
  }

  async function setStatus(sid, mid, status) {
    const id = `${sid}|${mid}`;
    if (!status) await DB.del('presences', id);
    else await DB.put('presences', { id, serviceId: sid, memberId: mid, status, at: new Date().toISOString() });
  }

  async function closeService() {
    const s = openService(); if (!s) return;
    const members = activeMembers().filter((m) => listable(m, s));
    const writes = [];
    for (const m of members) {
      if (!strictBelongs(m, s)) continue; // culte à préciser : jamais compté absent ailleurs que chez lui
      if (!presence(s.id, m.id)) writes.push({ id: `${s.id}|${m.id}`, serviceId: s.id, memberId: m.id, status: 'A', at: new Date().toISOString() });
    }
    if (writes.length) await DB.putMany('presences', writes);
    await DB.put('services', Object.assign({}, s, { closed: true, closedAt: new Date().toISOString() }));
    const newAlerts = await refreshAlerts();
    const st = (m) => (presence(s.id, m.id) || {}).status;
    const x = extras(s);
    ui.closeArmed = false; ui.q = ''; ui.filter = 'all';
    ui.lastClose = { serviceId: s.id, presents: members.filter((m) => st(m) === 'P').length, absents: members.filter((m) => st(m) === 'A').length,
      excuses: members.filter((m) => st(m) === 'E').length, v: x.v, e: x.e, alerts: newAlerts, culte: rappelCulte(s) };
    render();
  }

  /* ---------- Rappels : 2 absences successives SANS excuse aux cultes comptés du dimanche ---------- */
  // Recalculé à chaque clôture, correction, modification ou suppression d'une rencontre :
  // les rappels devenus sans objet sont clos, et une série manquée (saisie de cultes passés) est détectée.
  async function refreshAlerts() {
    let created = 0;
    for (const a of openAlerts()) {
      if (!a.serviceIds || !a.serviceIds.length) continue;
      const m = DB.get('members', a.memberId);
      let note = '';
      if (!m || m.actif === false) note = 'Membre marqué comme parti';
      else if (a.serviceIds.some((id) => !DB.get('services', id))) note = 'Annulé : rencontre supprimée';
      else if (a.serviceIds.some((id) => { const sv = DB.get('services', id); return !rappelCulte(sv) || !eligible(m, sv); })) note = 'Annulé : culte non compté pour ce membre';
      else if (a.serviceIds.some((id) => { const p = presence(id, a.memberId); return p && (p.status === 'P' || p.status === 'E'); })) note = 'Annulé : absence corrigée';
      if (note) await DB.put('alerts', Object.assign({}, a, { status: 'done', kind: 'Autre', note, doneAt: today() }));
    }
    const counted = rappelClosed();
    const open = new Set(openAlerts().map((a) => a.memberId));
    const all = DB.list('alerts');
    for (const m of activeMembers()) {
      if (open.has(m.id)) continue;
      const mine = counted.filter((s) => eligible(m, s));
      if (mine.length < 2) continue;
      const [x, y] = mine.slice(-2);
      const st = (s) => (presence(s.id, m.id) || { status: 'A' }).status;
      if (st(x) !== 'A' || st(y) !== 'A') continue;
      if (all.some((a) => a.memberId === m.id && ((a.serviceIds || []).some((id) => id === x.id || id === y.id) || (a.dates || []).includes(y.date)))) continue;
      await DB.put('alerts', { id: uid(), memberId: m.id, serviceIds: [x.id, y.id], dates: [x.date, y.date], createdAt: today(), status: 'open' });
      created++;
    }
    return created;
  }

  function viewOuvrir() {
    const lc = ui.lastClose;
    const recent = services().filter((s) => s.closed).slice(-8).reverse();
    const d = new Date();
    const dow = d.getDay();
    // Mercredi soir : enseignement · vendredi soir : prière · sinon culte
    const defK = dow === 3 ? 'enseignement' : dow === 5 ? 'priere' : 'culte';
    // Après le culte en français, on propose d'enchaîner avec le culte Jula Moré
    const doneToday = services().filter((x) => x.date === today() && svcKind(x) === 'culte').map(svcA);
    const defA = doneToday.includes('fr') && !doneToday.includes('jm') ? 'jm' : 'fr';
    const upcoming = events().filter((ev) => ev.days.some((x) => !dayService(ev, x.date)));
    $app.innerHTML = `
      <header class="head">
        <div class="row between">${KICKER}
          <a class="iconbtn" href="#/reglages" aria-label="Réglages" style="color:#fff">${ICON.gear}</a></div>
        <h1>Pointage</h1>
        <div class="sub">Aucune rencontre ouverte</div>
      </header>
      <div class="wrap">
        ${lc ? `<div class="banner warn" role="status"><strong>Pointage clôturé.</strong> ${lc.presents} membre${lc.presents > 1 ? 's' : ''} présent${lc.presents > 1 ? 's' : ''}, ${lc.absents} absent${lc.absents > 1 ? 's' : ''}${lc.excuses ? `, ${lc.excuses} excusé${lc.excuses > 1 ? 's' : ''}` : ''}.${lc.v + lc.e ? ` Total des présents : <strong>${lc.presents + lc.v + lc.e}</strong> (dont ${lc.v} non enregistré${lc.v > 1 ? 's' : ''} et ${lc.e} enfant${lc.e > 1 ? 's' : ''}).` : ''}
          ${lc.alerts ? ` ${lc.alerts} rappel${lc.alerts > 1 ? 's' : ''} créé${lc.alerts > 1 ? 's' : ''} (2 absences successives). <a href="#/rappels"><strong>Voir les rappels</strong></a>` : lc.culte ? ' Aucun nouveau rappel.' : ''}</div>` : ''}
        ${upcoming.length ? `<section class="card" style="display:flex;flex-direction:column;gap:8px"><h2>Journées spéciales</h2>
          ${upcoming.map((ev) => {
            const next = ev.days.find((x) => !dayService(ev, x.date));
            const i = ev.days.indexOf(next) + 1;
            return `<div class="row between" style="padding:8px 0;border-top:1px solid #EFEDE7;gap:10px">
              <div style="min-width:0"><div style="font-weight:700">${esc(ev.name)}</div>
              <div class="small muted">Jour ${i}/${ev.days.length} · ${esc(cap(fmtDate(next.date, { weekday: 'short', day: 'numeric', month: 'short' })))} · ${esc(next.start)}–${esc(next.end)}</div></div>
              <button type="button" class="btn primary sm" data-act="open-day" data-ev="${ev.id}" data-date="${next.date}">Pointer</button></div>`;
          }).join('')}</section>` : ''}
        <form class="card" id="openForm" style="display:flex;flex-direction:column;gap:12px">
          <h2>Ouvrir une rencontre</h2>
          <div class="field"><span class="lbl">Type de rencontre</span>
            <div class="seg" role="group" aria-label="Type de rencontre" id="skind">
              <button type="button" data-k="culte">Culte</button>
              <button type="button" data-k="enseignement">Enseignement</button>
              <button type="button" data-k="priere">Prière</button>
            </div></div>
          <div class="field" id="sculte"><span class="lbl">Quel culte ?</span>
            <div class="seg" role="group" aria-label="Quel culte" id="stype">
              <button type="button" data-t="fr" aria-pressed="${defA === 'fr'}">Français</button>
              <button type="button" data-t="jm" aria-pressed="${defA === 'jm'}">Jula Moré</button>
              <button type="button" data-t="commun" aria-pressed="false">Commun</button>
            </div></div>
          <span class="small muted" id="stypehelp"></span>
          <div class="field"><label for="sdate">Date</label><input id="sdate" type="date" value="${today()}" required></div>
          <div class="grid2">
            <div class="field"><label for="stime">Heure de début</label><input id="stime" type="time" value="${pad(d.getHours())}:00"></div>
            <div class="field"><label for="send">Heure de fin</label><input id="send" type="time"></div>
          </div>
          <div class="field"><label for="slabel">Intitulé (facultatif)</label><input id="slabel" type="text"></div>
          <label class="row" id="scountedrow" style="color:var(--ink);font-size:15px;font-weight:600;margin:0;min-height:44px">
            <input id="scounted" type="checkbox" checked style="width:22px;height:22px">
            Compter ce culte (bilans, et règle des 2 absences s’il a lieu un dimanche)</label>
          <div id="serr" class="err" role="alert"></div>
          <button class="btn primary block" type="submit">Ouvrir le pointage</button>
        </form>
        <a class="btn ghost block" href="#/journees">${ICON.plus}Programmer des journées spéciales</a>
        ${recent.length ? `<section class="card"><h2 style="margin-bottom:8px">Dernières rencontres</h2>
          ${recent.map((s) => `<div class="row between" style="padding:8px 0;border-top:1px solid #EFEDE7;gap:10px">
              <div style="min-width:0"><div style="font-weight:700">${esc(cap(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })))}${s.time ? ' · ' + esc(timeRange(s)) : ''}</div>
              <div class="small muted">${esc(svcName(s))} · ${serviceLine(s)}${svcKind(s) === 'culte' && !s.counted ? ' · non compté' : ''}</div></div>
              <a class="btn ghost sm" href="#/rencontre/${s.id}">Modifier</a></div>`).join('')}
          <a class="btn soft sm block" href="#/historique" style="margin-top:8px">Toutes les rencontres</a></section>` : ''}
      </div>`;
    const kindBtns = document.querySelectorAll('#skind button');
    const typeBtns = document.querySelectorAll('#stype button');
    let kind = defK, assemblee = defA;
    const HELP = { fr: 'Seuls les membres du culte en français apparaissent au pointage.', jm: 'Seuls les membres du culte Jula Moré apparaissent au pointage.',
      commun: 'Tous les membres apparaissent : Noël, journée de l’ASC, journée de la JAD…',
      enseignement: 'Enseignement du mercredi soir : les membres des deux cultes sont réunis.',
      priere: 'Prière du vendredi soir : les membres des deux cultes sont réunis.' };
    const refresh = () => {
      kindBtns.forEach((x) => x.setAttribute('aria-pressed', x.dataset.k === kind));
      typeBtns.forEach((x) => x.setAttribute('aria-pressed', x.dataset.t === assemblee));
      const isCulte = kind === 'culte';
      document.getElementById('sculte').hidden = !isCulte;
      document.getElementById('scountedrow').hidden = !isCulte;
      document.getElementById('stypehelp').textContent = HELP[isCulte ? assemblee : kind];
      document.getElementById('slabel').placeholder = !isCulte ? 'Ex. : thème de la soirée' : assemblee === 'commun' ? 'Ex. : Noël, journée de l’ASC, journée de la JAD' : 'Ex. : 1er culte';
    };
    kindBtns.forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; refresh(); }));
    typeBtns.forEach((b) => b.addEventListener('click', () => { assemblee = b.dataset.t; refresh(); }));
    refresh();
    document.getElementById('openForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('sdate').value || today();
      const isCulte = kind === 'culte';
      const serr = document.getElementById('serr');
      if (date > today()) { serr.textContent = 'On ne peut pas pointer une rencontre à venir : choisissez la date du jour ou une date passée.'; return; }
      // Même rencontre déjà enregistrée ce jour-là : on prévient (second appui pour confirmer)
      const twin = services().find((x) => x.date === date && svcKind(x) === kind && (kind !== 'culte' || svcA(x) === assemblee || svcA(x) === 'commun' || assemblee === 'commun'));
      if (twin && ui.dupSvc !== `${date}|${kind}|${assemblee}`) {
        ui.dupSvc = `${date}|${kind}|${assemblee}`;
        serr.textContent = `Attention : « ${svcName(twin)} » est déjà enregistré le ${fmtDate(date, { day: 'numeric', month: 'long' })}. Ouvrir une seconde fois compterait les absents deux fois. Appuyez de nouveau sur « Ouvrir le pointage » seulement s’il s’agit bien d’une autre rencontre.`;
        return;
      }
      ui.dupSvc = null;
      await DB.put('services', { id: uid(), date, time: document.getElementById('stime').value, timeEnd: document.getElementById('send').value,
        kind, assemblee: isCulte ? assemblee : 'commun', type: isCulte ? (assemblee === 'commun' ? 'special' : 'dimanche') : 'semaine',
        label: document.getElementById('slabel').value.trim(), counted: isCulte ? document.getElementById('scounted').checked : false, closed: false });
      ui.lastClose = null; ui.q = ''; ui.filter = 'all';
      render();
    });
  }

  /* ================= JOURNÉES SPÉCIALES ================= */
  // Activités sur plusieurs jours (ex. 3 jours de prière de la JAD) : chaque jour a ses heures et son pointage ; tous les membres sont réunis.
  const EV_TYPES = { enseignement: 'Enseignement', priere: 'Prière', autre: 'Autre' };
  function events() { return (DB.setting('events', []) || []).slice().sort((a, b) => a.start.localeCompare(b.start)); }
  function dayService(ev, date) { return services().find((s) => s.eventId === ev.id && s.date === date) || null; }
  function datesBetween(a, b) {
    const out = []; const d = parseDate(a), end = parseDate(b);
    while (d <= end && out.length < 31) { out.push(isoDate(d)); d.setDate(d.getDate() + 1); }
    return out;
  }

  function viewJournees() {
    const list = events().slice().reverse();
    const editEv = ui.evEdit ? events().find((x) => x.id === ui.evEdit) : null;
    const ev0 = editEv || { name: '', type: 'priere', start: today(), end: today(), days: [] };
    const d0 = ev0.days[0] || { start: '18:00', end: '21:00' };
    $app.innerHTML = `
      <div class="bar"><a class="iconbtn" href="#/pointage" aria-label="Retour">${ICON.back}</a><h1>Journées spéciales</h1></div>
      <div class="wrap">
        <form class="card" id="evForm" style="display:flex;flex-direction:column;gap:12px" novalidate>
          <h2>${editEv ? 'Modifier les journées' : 'Programmer des journées'}</h2>
          <p class="small muted" style="margin:0">Ex. : 3 jours d’enseignement ou de prière de la JAD. Les membres des deux cultes sont réunis.</p>
          <div class="field"><label for="ev-name">Nom de l’activité <span class="req">*</span></label><input id="ev-name" type="text" placeholder="Ex. : 3 jours de prière de la JAD" value="${esc(ev0.name)}"></div>
          <div class="field"><span class="lbl">Type</span><div class="seg" role="group" aria-label="Type d’activité" id="ev-type">
            ${Object.entries(EV_TYPES).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${ev0.type === k}">${l}</button>`).join('')}</div></div>
          <div class="grid2">
            <div class="field"><label for="ev-start">Date de début <span class="req">*</span></label><input id="ev-start" type="date" value="${esc(ev0.start)}"></div>
            <div class="field"><label for="ev-end">Date de fin <span class="req">*</span></label><input id="ev-end" type="date" value="${esc(ev0.end)}"></div>
          </div>
          <div class="grid2">
            <div class="field"><label for="ev-h1">Heure de début</label><input id="ev-h1" type="time" value="${esc(d0.start)}"></div>
            <div class="field"><label for="ev-h2">Heure de fin</label><input id="ev-h2" type="time" value="${esc(d0.end)}"></div>
          </div>
          <span class="small muted">Ces heures s’appliquent à tous les jours. Vous pouvez ensuite les changer jour par jour ci-dessous.</span>
          <div id="ev-days" style="display:flex;flex-direction:column;gap:8px"></div>
          <div id="ev-err" class="err" role="alert"></div>
          <button class="btn primary block" type="submit">${editEv ? 'Enregistrer les modifications' : 'Enregistrer les journées'}</button>
          ${editEv ? '<button type="button" class="btn ghost block" data-act="ev-cancel">Annuler la modification</button>' : ''}
        </form>
        ${list.length ? `<section class="card" style="display:flex;flex-direction:column;gap:6px"><h2 style="margin-bottom:4px">Journées programmées</h2>
          ${list.map((ev) => `<div style="padding:10px 0;border-top:1px solid #EFEDE7;display:flex;flex-direction:column;gap:6px">
            <div class="row between"><div><div style="font-weight:700">${esc(ev.name)}</div><div class="small muted">${esc(EV_TYPES[ev.type] || '')} · ${ev.days.length} jour${ev.days.length > 1 ? 's' : ''}</div></div>
            <div class="row" style="gap:12px"><button type="button" class="linkbtn" data-act="ev-edit" data-ev="${ev.id}">Modifier</button>
            ${ev.days.some((x) => dayService(ev, x.date)) ? '' : `<button type="button" class="linkbtn" data-act="ev-del" data-ev="${ev.id}">Supprimer</button>`}</div></div>
            ${ev.days.map((x, i) => {
              const sv = dayService(ev, x.date);
              const nP = sv ? membersPresent(sv) : 0;
              return `<div class="row between small" style="gap:8px"><span>Jour ${i + 1} · ${esc(cap(fmtDate(x.date, { weekday: 'short', day: 'numeric', month: 'short' })))} · ${esc(x.start)}–${esc(x.end)}</span>
                ${sv ? `<span class="tag ${sv.closed ? 'ok' : 'warn'}">${sv.closed ? nP + ' présent' + (nP > 1 ? 's' : '') : 'en cours'}</span>`
                     : `<button type="button" class="btn ghost sm" data-act="open-day" data-ev="${ev.id}" data-date="${x.date}">Pointer</button>`}</div>`;
            }).join('')}</div>`).join('')}</section>` : ''}
      </div>`;
    const form = document.getElementById('evForm');
    let evType = ev0.type;
    const typeBtns = form.querySelectorAll('#ev-type button');
    typeBtns.forEach((b) => b.addEventListener('click', () => { evType = b.dataset.t; typeBtns.forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
    // Heures connues par jour : celles de la journée modifiée, puis ce que l'utilisateur a saisi
    let known = new Map(ev0.days.map((d) => [d.date, { start: d.start, end: d.end }]));
    const drawDays = (resetTimes) => {
      form.querySelectorAll('#ev-days .day').forEach((el) => known.set(el.dataset.date, { start: el.querySelector('.d1').value, end: el.querySelector('.d2').value }));
      if (resetTimes) known = new Map();
      const a = form.querySelector('#ev-start').value, z = form.querySelector('#ev-end').value;
      const h1 = form.querySelector('#ev-h1').value, h2 = form.querySelector('#ev-h2').value;
      const box = form.querySelector('#ev-days');
      if (!a || !z || z < a) { box.innerHTML = ''; return; }
      box.innerHTML = datesBetween(a, z).map((dt, i) => {
        const k = known.get(dt) || { start: h1, end: h2 };
        const locked = editEv && dayService(editEv, dt);
        return `<div class="day" data-date="${dt}" style="background:#F6F5F1;border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px">
        <div style="font-weight:700;font-size:15px">Jour ${i + 1} · ${esc(cap(fmtDate(dt, { weekday: 'long', day: 'numeric', month: 'long' })))}${locked ? ' <span class="tag ok">déjà pointé</span>' : ''}</div>
        <div class="grid2"><div class="field"><label for="d1-${dt}">Début</label><input id="d1-${dt}" class="d1" type="time" value="${esc(k.start)}"></div>
        <div class="field"><label for="d2-${dt}">Fin</label><input id="d2-${dt}" class="d2" type="time" value="${esc(k.end)}"></div></div></div>`;
      }).join('');
    };
    ['#ev-start', '#ev-end'].forEach((sel) => form.querySelector(sel).addEventListener('change', () => drawDays(false)));
    ['#ev-h1', '#ev-h2'].forEach((sel) => form.querySelector(sel).addEventListener('change', () => drawDays(true)));
    drawDays(false);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('#ev-err');
      const name = form.querySelector('#ev-name').value.trim();
      const a = form.querySelector('#ev-start').value, z = form.querySelector('#ev-end').value;
      if (!name) { err.textContent = 'Indiquez le nom de l’activité.'; return; }
      if (!a || !z || z < a) { err.textContent = 'La date de fin doit être le même jour ou après la date de début.'; return; }
      if (datesBetween(a, z).length > 30) { err.textContent = '30 jours au maximum.'; return; }
      const days = [...form.querySelectorAll('#ev-days .day')].map((el) => ({ date: el.dataset.date, start: el.querySelector('.d1').value, end: el.querySelector('.d2').value }));
      if (days.some((x) => !x.start || !x.end)) { err.textContent = 'Indiquez l’heure de début et de fin de chaque jour.'; return; }
      const all = DB.setting('events', []) || [];
      if (editEv) {
        const lost = editEv.days.filter((d) => dayService(editEv, d.date) && !days.some((x) => x.date === d.date));
        if (lost.length) { err.textContent = `Le ${fmtDate(lost[0].date, { weekday: 'long', day: 'numeric', month: 'long' })} a déjà été pointé : il ne peut pas être retiré.`; return; }
        const upd = Object.assign({}, editEv, { name, type: evType, start: a, end: z, days });
        await DB.setSetting('events', all.map((x) => (x.id === editEv.id ? upd : x)));
        // Les journées déjà pointées prennent le nouveau nom et les nouvelles heures
        for (const sv of services().filter((s) => s.eventId === editEv.id)) {
          const i = days.findIndex((d) => d.date === sv.date);
          if (i < 0) continue;
          await DB.put('services', Object.assign({}, sv, { label: `${name} · jour ${i + 1}/${days.length}`, eventType: evType, time: days[i].start, timeEnd: days[i].end }));
        }
        ui.evEdit = null; toast('Journées modifiées');
      } else {
        await DB.setSetting('events', all.concat([{ id: uid(), name, type: evType, start: a, end: z, days }]));
        toast('Journées enregistrées');
      }
      render(); window.scrollTo(0, 0);
    });
  }

  async function openEventDay(evId, date) {
    if (openService()) { toast("Clôturez d'abord la rencontre en cours"); return; }
    if (date > today()) { toast('Ce jour n’est pas encore arrivé : le pointage s’ouvrira le jour même.'); return; }
    const ev = events().find((x) => x.id === evId); if (!ev) return;
    const i = ev.days.findIndex((x) => x.date === date); const day = ev.days[i];
    await DB.put('services', { id: uid(), date, time: day.start, timeEnd: day.end, kind: 'activite', eventId: ev.id, eventType: ev.type,
      assemblee: 'commun', type: 'special', label: `${ev.name} · jour ${i + 1}/${ev.days.length}`, counted: false, closed: false });
    ui.lastClose = null; ui.q = ''; ui.filter = 'all';
    go('#/pointage');
  }

  /* ================= RENCONTRES : modifier, supprimer, historique ================= */
  const membersPresent = (s) => DB.list('presences').filter((p) => p.serviceId === s.id && p.status === 'P').length;
  function serviceLine(s) {
    const nP = membersPresent(s); const x = extras(s);
    return `${nP} membre${nP > 1 ? 's' : ''} présent${nP > 1 ? 's' : ''}${x.v + x.e ? ` · total ${nP + x.v + x.e}` : ''}`;
  }

  function viewHistorique() {
    const list = services().slice().reverse();
    let cur = '';
    const rows = list.map((s) => {
      const ym = s.date.slice(0, 7);
      const head = ym !== cur ? `<h3 style="margin:14px 0 4px">${cap(MONTHS[Number(ym.slice(5)) - 1])} ${ym.slice(0, 4)}</h3>` : '';
      cur = ym;
      return head + `<a class="row between" href="#/rencontre/${s.id}" style="padding:10px 0;border-top:1px solid #EFEDE7;text-decoration:none;color:inherit;gap:10px">
        <div style="min-width:0"><div style="font-weight:700">${esc(cap(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })))}${s.time ? ' · ' + esc(timeRange(s)) : ''}</div>
        <div class="small muted">${esc(svcName(s))} · ${s.closed ? serviceLine(s) : 'pointage en cours'}${svcKind(s) === 'culte' && !s.counted ? ' · non compté' : ''}</div></div>
        <span class="small" style="font-weight:700;color:var(--brand)">Modifier</span></a>`;
    }).join('');
    $app.innerHTML = `<div class="bar"><a class="iconbtn" href="#/pointage" aria-label="Retour">${ICON.back}</a><h1>Toutes les rencontres</h1></div>
      <div class="wrap"><section class="card" style="padding-top:2px">${rows || '<div class="empty">Aucune rencontre pour le moment.</div>'}</section></div>`;
  }

  function viewRencontre(r) {
    const s = DB.get('services', r.id);
    if (!s) {
      $app.innerHTML = `<div class="bar"><a class="iconbtn" href="#/historique" aria-label="Retour">${ICON.back}</a><h1>Rencontre</h1></div><div class="empty">Cette rencontre n'existe plus.</div>`;
      return;
    }
    const k = svcKind(s); const isAct = k === 'activite'; const x = extras(s);
    const nPr = DB.list('presences').filter((p) => p.serviceId === s.id).length;
    $app.innerHTML = `
      <div class="bar"><a class="iconbtn" href="${s.closed ? '#/historique' : '#/pointage'}" aria-label="Retour">${ICON.back}</a><h1>Modifier la rencontre</h1></div>
      <div class="wrap">
        <form id="rform" class="card" style="display:flex;flex-direction:column;gap:12px" novalidate>
          <div class="small muted">${esc(cap(fmtDate(s.date)))} · ${esc(svcName(s))}</div>
          ${isAct ? `<p class="small muted" style="margin:0">Journée spéciale : le nom, la date et les heures se modifient dans « Journées spéciales ».</p>`
          : `<div class="field"><span class="lbl">Type de rencontre</span><div class="seg" role="group" aria-label="Type de rencontre" id="rkind">
              ${[['culte', 'Culte'], ['enseignement', 'Enseignement'], ['priere', 'Prière']].map(([v, l]) => `<button type="button" data-k="${v}" aria-pressed="${k === v}">${l}</button>`).join('')}</div></div>
            <div class="field" id="rculte" ${k === 'culte' ? '' : 'hidden'}><span class="lbl">Quel culte ?</span><div class="seg" role="group" aria-label="Quel culte" id="rtype">
              ${[['fr', 'Français'], ['jm', 'Jula Moré'], ['commun', 'Commun']].map(([v, l]) => `<button type="button" data-t="${v}" aria-pressed="${svcA(s) === v}">${l}</button>`).join('')}</div></div>
            <div class="field"><label for="rdate">Date</label><input id="rdate" type="date" value="${esc(s.date)}"></div>
            <div class="grid2"><div class="field"><label for="rtime">Heure de début</label><input id="rtime" type="time" value="${esc(s.time || '')}"></div>
              <div class="field"><label for="rend">Heure de fin</label><input id="rend" type="time" value="${esc(s.timeEnd || '')}"></div></div>
            <div class="field"><label for="rlabel">Intitulé (facultatif)</label><input id="rlabel" type="text" value="${esc(s.label || '')}"></div>
            <label class="row" id="rcountedrow" ${k === 'culte' ? '' : 'hidden'} style="color:var(--ink);font-size:15px;font-weight:600;margin:0;min-height:44px">
              <input id="rcounted" type="checkbox" ${s.counted ? 'checked' : ''} style="width:22px;height:22px">Compter ce culte (bilans, et règle des 2 absences s’il a lieu un dimanche)</label>`}
          <div class="grid2">
            <div class="field"><label for="rvis">Membres non enregistrés</label><input id="rvis" type="number" inputmode="numeric" min="0" value="${x.v}"></div>
            <div class="field"><label for="renf">Enfants</label><input id="renf" type="number" inputmode="numeric" min="0" value="${x.e}"></div>
          </div>
          <div id="rerr2" class="err" role="alert"></div>
          <button class="btn primary block" type="submit">Enregistrer</button>
        </form>
        <section class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Pointage</h3>
          <p class="small muted" style="margin:0">${s.closed ? serviceLine(s) + ' · clôturé' : 'Pointage en cours'}</p>
          ${s.closed ? `<button type="button" class="btn ghost block" data-act="reopen" data-id="${s.id}">Corriger le pointage</button>` : '<a class="btn ghost block" href="#/pointage">Revenir au pointage</a>'}
        </section>
        <section class="card">
          ${ui.delArmed === s.id
            ? `<p style="margin:0 0 10px">Supprimer définitivement cette rencontre et ses ${nPr} pointage${nPr > 1 ? 's' : ''} ? Les statistiques et les rappels seront recalculés sans elle.</p>
               <div class="row"><button type="button" class="btn ghost sm" style="flex:1" data-act="sdel-cancel">Annuler</button>
               <button type="button" class="btn danger sm" style="flex:1" data-act="sdel-confirm" data-id="${s.id}">Supprimer</button></div>`
            : `<button type="button" class="btn danger sm block" data-act="sdel-arm" data-id="${s.id}">Supprimer cette rencontre</button>`}
        </section>
      </div>`;
    let kind = k, asm = svcA(s);
    if (!isAct) {
      const kb = document.querySelectorAll('#rkind button'), tb = document.querySelectorAll('#rtype button');
      const refresh = () => {
        kb.forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === kind));
        tb.forEach((b) => b.setAttribute('aria-pressed', b.dataset.t === asm));
        document.getElementById('rculte').hidden = kind !== 'culte';
        document.getElementById('rcountedrow').hidden = kind !== 'culte';
      };
      kb.forEach((b) => b.addEventListener('click', () => { kind = b.dataset.k; refresh(); }));
      tb.forEach((b) => b.addEventListener('click', () => { asm = b.dataset.t; refresh(); }));
    }
    document.getElementById('rform').addEventListener('submit', async (e) => {
      e.preventDefault();
      const upd = { visiteurs: num(document.getElementById('rvis').value), enfants: num(document.getElementById('renf').value) };
      if (!isAct) {
        const date = document.getElementById('rdate').value;
        if (!date) { document.getElementById('rerr2').textContent = 'Indiquez la date.'; return; }
        if (date > today()) { document.getElementById('rerr2').textContent = 'La date ne peut pas être dans le futur.'; return; }
        const isC = kind === 'culte';
        Object.assign(upd, { date, time: document.getElementById('rtime').value, timeEnd: document.getElementById('rend').value, kind,
          assemblee: isC ? asm : 'commun', type: isC ? (asm === 'commun' ? 'special' : 'dimanche') : 'semaine',
          label: document.getElementById('rlabel').value.trim(), counted: isC ? document.getElementById('rcounted').checked : false });
      }
      // Type ou culte changé sur une rencontre clôturée : les membres concernés ne sont plus les mêmes,
      // le pointage est rouvert pour vérification (les absences automatiques sont recalculées à la clôture)
      const changed = s.closed && !isAct && (upd.kind !== svcKind(s) || upd.assemblee !== svcA(s));
      if (changed) {
        const cur = openService();
        if (cur && cur.id !== s.id) { document.getElementById('rerr2').textContent = "Clôturez d'abord la rencontre en cours, puis recommencez."; return; }
        for (const pr of DB.list('presences').filter((x) => x.serviceId === s.id && x.status === 'A')) await DB.del('presences', pr.id);
        upd.closed = false;
      }
      await DB.put('services', Object.assign({}, DB.get('services', s.id), upd));
      await refreshAlerts();
      if (changed) { toast('Type modifié : vérifiez le pointage, puis clôturez.'); go('#/pointage'); return; }
      toast('Rencontre mise à jour'); go(s.closed ? '#/historique' : '#/pointage');
    });
  }

  /* ================= MEMBRES ================= */
  function viewMembres() {
    const n = activeMembers().length;
    $app.innerHTML = `
      <header class="head light">
        ${KICKER}
        <div class="row between"><h1>Membres</h1><a class="btn primary sm" href="#/nouveau">${ICON.plus}Nouveau</a></div>
        <div class="sub muted">${n} membre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}</div>
      </header>
      <div class="wrap">
        <label for="mq" style="margin:0">Rechercher</label>
        <input id="mq" type="search" placeholder="Nom, prénom, téléphone, zone" value="${esc(ui.mq)}" autocomplete="off">
        <div class="seg segwrap" role="group" aria-label="Filtrer par culte" id="mfilters"></div>
        <ul class="list" id="mlist"></ul>
      </div>`;
    document.getElementById('mq').addEventListener('input', (e) => { ui.mq = e.target.value; drawMembres(); });
    drawMembres();
  }
  function drawMembres() {
    const q = norm(ui.mq);
    const all = activeMembers();
    const gone = allMembers().filter((m) => m.actif === false);
    const f = ui.mCulte || 'all';
    const opts = [['all', `Tous (${all.length})`], ['fr', `Français (${all.filter((m) => m.culte === 'fr').length})`], ['jm', `Jula Moré (${all.filter((m) => m.culte === 'jm').length})`]];
    const nNone = all.filter((m) => !m.culte).length;
    if (nNone) opts.push(['none', `À préciser (${nNone})`]);
    if (gone.length) opts.push(['gone', `Partis (${gone.length})`]);
    document.getElementById('mfilters').innerHTML = opts.map(([k, l]) => `<button type="button" data-act="mculte" data-k="${k}" aria-pressed="${f === k}" style="font-size:14px">${l}</button>`).join('');
    const list = (f === 'gone' ? gone : all).filter((m) => (f === 'all' || f === 'gone' || (f === 'none' ? !m.culte : m.culte === f)) && (!q || norm([m.nom, m.prenoms, m.tel, m.zone, m.quartier].join(' ')).includes(q)));
    document.getElementById('mlist').innerHTML = list.length ? list.map((m) => `
      <li><a class="mrow" href="#/membre/${m.id}" style="text-decoration:none;color:inherit">
        ${photoHtml(m, 56)}
        <span class="who"><span class="name">${esc(fullName(m))}</span>
        <span class="info">${esc([m.actif === false ? 'Parti(e)' : '', m.culte ? CULTE_SHORT[m.culte] : 'Culte à préciser', m.statut, m.zone ? 'Zone ' + m.zone : ''].filter(Boolean).join(' · '))}</span></span>
      </a></li>`).join('') : `<li class="empty">${activeMembers().length ? 'Aucun membre ne correspond.' : 'Aucun membre enregistré pour le moment.'}</li>`;
  }

  function viewFiche(r) {
    const m = DB.get('members', r.id);
    if (!m) { $app.innerHTML = '<div class="empty">Membre introuvable.</div>'; return; }
    const ph = DB.get('photos', m.id);
    const now = new Date();
    const monthList = countedClosed().filter((s) => s.date.startsWith(`${now.getFullYear()}-${pad(now.getMonth() + 1)}`));
    const ms = memberStats(m, monthList);
    const last6 = countedClosed().filter((s) => eligible(m, s)).slice(-6);
    const yearStats = memberStats(m, countedClosed().filter((s) => s.date.startsWith(String(now.getFullYear()))));
    const alerts = DB.list('alerts').filter((a) => a.memberId === m.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const bapt = m.baptise === 'oui' ? `Oui${m.dateBapteme ? ' · ' + esc(fmtDate(m.dateBapteme, { day: 'numeric', month: 'long', year: 'numeric' })) : ''}` : m.baptise === 'non' ? 'Non' : '—';
    const rowsInfo = [
      ['Culte', m.culte ? esc(CULTES[m.culte]) : '<span class="low">À préciser</span>'],
      ...((m.culteHistory || []).length > 1 ? [['Transferts', m.culteHistory.slice(1).map((x, i) => `${esc(CULTE_SHORT[m.culteHistory[i].culte])} → ${esc(CULTE_SHORT[x.culte])} le ${esc(fmtDate(x.from, { day: 'numeric', month: 'short', year: 'numeric' }))}`).join('<br>')]] : []),
      ['Téléphone', m.tel ? `<a href="tel:${esc(telHref(m.tel))}">${esc(m.tel)}</a>` : '—'],
      ['Sexe', esc(m.sexe || '—')],
      ['Quartier · zone', esc([m.quartier, m.zone ? 'Zone ' + m.zone : ''].filter(Boolean).join(' · ') || '—')],
      ['Église de provenance', esc(m.provenance || '—')],
      ["Baptisé(e) d'eau", bapt],
      ['Date de naissance', m.naissance ? esc(fmtDate(m.naissance, { day: 'numeric', month: 'long', year: 'numeric' })) : '—'],
      ['Situation familiale', esc(m.famille || '—')],
      ['Groupes', esc(m.groupes || '—')],
      ["Arrivée à l'église", esc(fmtDate(arrival(m), { day: 'numeric', month: 'long', year: 'numeric' }))],
      ['Enregistré(e) le', esc(fmtDate(m.createdAt, { day: 'numeric', month: 'long', year: 'numeric' }))]
    ];
    $app.innerHTML = `
      <div class="bar"><a class="iconbtn" href="#/membres" aria-label="Retour aux membres">${ICON.back}</a><h1>Fiche membre</h1>
        <a class="btn ghost sm" href="#/modifier/${m.id}">Modifier</a></div>
      <div class="wrap">
        <section style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
          ${photoHtml(m, 132)}
          <label class="btn soft sm" style="margin:0;color:var(--brand)">${ICON.camera}Changer la photo
            <input type="file" accept="image/*" capture="user" id="fphoto" hidden></label>
          <div class="small muted">${ph ? 'Photo mise à jour le ' + esc(fmtDate(ph.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })) : 'Pas encore de photo'}</div>
          <h2 style="font-size:24px">${esc(fullName(m))}</h2>
          ${m.actif === false ? `<div class="banner warn" style="width:100%;box-sizing:border-box">Parti(e) le ${esc(fmtDate(departs(m).slice(-1)[0].from, { day: 'numeric', month: 'long', year: 'numeric' }))} : n’apparaît plus au pointage. Son historique reste dans les bilans.</div>` : ''}
          <div class="row" style="flex-wrap:wrap;justify-content:center">
            ${m.statut ? `<span class="tag dark">${esc(m.statut)}</span>` : ''}
            ${m.baptise === 'oui' ? `<span class="tag ok">Baptisé(e) d'eau</span>` : ''}
          </div>
        </section>
        <section class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="row between"><h3>Participation aux cultes</h3><a href="#/bilans" class="small" style="font-weight:600">Voir les bilans</a></div>
          <div>${cap(MONTHS[now.getMonth()])} : <strong>${ms.P} culte${ms.P > 1 ? 's' : ''} sur ${ms.denom}</strong> (${pct(ms.rate)})${ms.E ? ` · ${ms.E} excusé${ms.E > 1 ? 's' : ''}` : ''}</div>
          <div class="small muted">Année ${now.getFullYear()} : ${yearStats.P} sur ${yearStats.denom} (${pct(yearStats.rate)})</div>
          ${['enseignement', 'priere'].map((k) => { const st = memberStats(m, services().filter((x) => x.closed && svcKind(x) === k && x.date.startsWith(String(now.getFullYear())))); return st.denom || st.E ? `<div class="small muted">${k === 'enseignement' ? 'Enseignements (mercredi)' : 'Prières (vendredi)'} ${now.getFullYear()} : ${st.P} sur ${st.denom} (${pct(st.rate)})</div>` : ''; }).join('')}
          ${last6.length ? `<div class="dots" role="list" aria-label="Derniers cultes comptés">${last6.map((s) => {
            const st = (presence(s.id, m.id) || { status: 'A' }).status;
            return `<div role="listitem"><div class="dot ${st}" aria-label="${{ P: 'présent', A: 'absent', E: 'excusé' }[st]}">${st}</div><span class="small muted">${esc(fmtShort(s.date))}</span></div>`;
          }).join('')}</div><div class="small muted">P présent · A absent · E excusé</div>` : '<div class="small muted">Aucun culte compté depuis son enregistrement.</div>'}
        </section>
        <section class="card"><h3>Informations</h3><dl class="dl">${rowsInfo.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl></section>
        ${alerts.length ? `<section class="card"><h3 style="margin-bottom:6px">Rappels d'absence</h3>${alerts.map((a) => `
          <div style="padding:8px 0;border-top:1px solid #EFEDE7"><div style="font-weight:600">Absent les ${esc(a.dates.map(fmtShort).join(' et '))}</div>
          <div class="small muted">${a.status === 'done' ? `Traité : ${esc(a.kind)}${a.note ? ' — ' + esc(a.note) : ''}` : 'À traiter'}</div></div>`).join('')}</section>` : ''}
        <section class="card">
          ${m.actif === false ? `<button type="button" class="btn primary sm block" data-act="reactivate" data-id="${m.id}">Réactiver ce membre (il revient)</button>` : ui.leaveArmed === m.id
            ? `<p style="margin:0 0 10px">Marquer ${esc(fullName(m))} comme parti(e) ? La fiche et l'historique sont conservés, mais la personne n'apparaît plus au pointage.</p>
               <div class="row"><button type="button" class="btn ghost sm" style="flex:1" data-act="leave-cancel">Annuler</button>
               <button type="button" class="btn danger sm" style="flex:1" data-act="leave-confirm" data-id="${m.id}">Confirmer</button></div>`
            : `<button type="button" class="btn danger sm block" data-act="leave-arm" data-id="${m.id}">Marquer comme parti(e)</button>`}
        </section>
      </div>`;
    document.getElementById('fphoto').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { await savePhoto(m.id, await readPhoto(f)); toast('Photo mise à jour'); render(); } catch (err) { toast(err.message); }
    });
  }

  /* ---------- Formulaire nouveau / modifier ---------- */
  function viewForm(r) {
    const editing = r.name === 'modifier' ? DB.get('members', r.id) : null;
    const fromPointage = r.query.get('from') === 'pointage' && openService();
    const m = editing || { sexe: '', baptise: '', statut: 'Nouveau venu' };
    if (ui.formFor !== (editing ? editing.id : 'new')) { ui.formPhoto = null; ui.formFor = editing ? editing.id : 'new'; }
    const zones = [...new Set(DB.list('members').map((x) => x.zone).filter(Boolean))].sort();
    const quartiers = [...new Set(DB.list('members').map((x) => x.quartier).filter(Boolean))].sort();
    const photoPreview = ui.formPhoto
      ? `<div class="ph ph132"><img src="${ui.formPhoto}" alt="Nouvelle photo"></div>`
      : editing && DB.get('photos', editing.id) ? photoHtml(editing, 132)
        : `<div class="ph ph132 ph-empty" role="img" aria-label="Pas encore de photo">${ICON.camera.replace('class="i"', 'class="i" style="width:44px;height:44px"')}</div>`;
    const seg = (name, opts, val) => `<div class="seg" role="group" data-seg="${name}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div><input type="hidden" name="${name}" value="${esc(val || '')}">`;
    const back = editing ? `#/membre/${editing.id}` : fromPointage ? '#/pointage' : '#/membres';
    $app.innerHTML = `
      <div class="bar"><a class="iconbtn" href="${back}" aria-label="Retour">${ICON.back}</a><h1>${editing ? 'Modifier la fiche' : 'Ajouter un membre'}</h1></div>
      <form id="mform" class="wrap" novalidate style="gap:18px">
        <section style="display:flex;flex-direction:column;align-items:center;gap:10px">
          ${photoPreview}
          <div class="row">
            <label class="btn primary sm" style="margin:0;color:#fff">${ICON.camera}Prendre la photo<input type="file" accept="image/*" capture="user" data-photo hidden></label>
            <label class="btn ghost sm" style="margin:0">Galerie<input type="file" accept="image/*" data-photo hidden></label>
          </div>
        </section>
        <fieldset><legend>Identité</legend>
          <div class="grid2">
            <div class="field"><label for="f-nom">Nom <span class="req">*</span></label><input id="f-nom" name="nom" type="text" value="${esc(m.nom)}" autocapitalize="characters"></div>
            <div class="field"><label for="f-prenoms">Prénoms <span class="req">*</span></label><input id="f-prenoms" name="prenoms" type="text" value="${esc(m.prenoms)}" autocapitalize="words"></div>
          </div>
          <div class="field"><span class="lbl">Sexe <span class="req">*</span></span>${seg('sexe', [['Homme', 'Homme'], ['Femme', 'Femme']], m.sexe)}</div>
          <div class="grid2">
            <div class="field"><label for="f-naissance">Date de naissance</label><input id="f-naissance" name="naissance" type="date" value="${esc(m.naissance)}"></div>
            <div class="field"><label for="f-tel">Téléphone <span class="req">*</span></label><input id="f-tel" name="tel" type="tel" inputmode="tel" placeholder="70 00 00 00" value="${esc(m.tel)}"></div>
          </div>
        </fieldset>
        <fieldset><legend>Église et foi</legend>
          <div class="field"><span class="lbl">Culte d'appartenance <span class="req">*</span></span>${seg('culte', [['fr', 'Culte en français'], ['jm', 'Culte Jula Moré']], m.culte || (!editing && fromPointage && svcA(openService()) !== 'commun' ? svcA(openService()) : ''))}</div>
          ${editing && editing.culte ? `<div class="field" id="transfer" hidden><label for="f-transfert">Date du transfert</label><input id="f-transfert" name="dateTransfert" type="date" value="${today()}" max="${today()}">
            <span class="small muted" style="margin-top:4px">Les rencontres d’avant cette date restent comptées dans l’ancien culte.</span></div>` : ''}
          <div class="field"><label for="f-arrivee">Date d'arrivée à l'église <span class="req">*</span></label><input id="f-arrivee" name="dateArrivee" type="date" value="${esc(editing ? arrival(m) : fromPointage ? openService().date : today())}" max="${today()}">
            <span class="small muted" style="margin-top:4px">Présences et absences sont comptées à partir de cette date seulement.</span></div>
          <div class="field"><label for="f-prov">Église de provenance</label><input id="f-prov" name="provenance" type="text" placeholder="Nom de l'église, ville" value="${esc(m.provenance)}"></div>
          <div class="field"><span class="lbl">Baptisé(e) d'eau ? <span class="req">*</span></span>${seg('baptise', [['oui', 'Oui'], ['non', 'Non']], m.baptise)}</div>
          <div class="field" id="bapt-date" ${m.baptise === 'oui' ? '' : 'hidden'}><label for="f-dbapt">Date du baptême (si connue)</label><input id="f-dbapt" name="dateBapteme" type="date" value="${esc(m.dateBapteme)}"></div>
        </fieldset>
        <fieldset><legend>Quartier et famille</legend>
          <div class="grid2">
            <div class="field"><label for="f-quartier">Quartier</label><input id="f-quartier" name="quartier" type="text" list="dl-quartiers" value="${esc(m.quartier)}"></div>
            <div class="field"><label for="f-zone">Zone</label><input id="f-zone" name="zone" type="text" list="dl-zones" placeholder="Ex. : Yégueré" value="${esc(m.zone)}"></div>
          </div>
          <datalist id="dl-zones">${zones.map((z) => `<option value="${esc(z)}">`).join('')}</datalist>
          <datalist id="dl-quartiers">${quartiers.map((z) => `<option value="${esc(z)}">`).join('')}</datalist>
          <div class="field"><label for="f-famille">Situation familiale</label><select id="f-famille" name="famille">
            ${['', 'Célibataire', 'Marié(e)', 'Veuf / veuve', 'Divorcé(e)'].map((v) => `<option value="${v}" ${m.famille === v ? 'selected' : ''}>${v || '—'}</option>`).join('')}</select></div>
          <div class="field"><label for="f-statut">Statut</label><select id="f-statut" name="statut">
            ${['Nouveau venu', 'Membre', 'Nouveau converti'].concat(m.statut && !['Nouveau venu', 'Membre', 'Nouveau converti'].includes(m.statut) ? [m.statut] : []).map((v) => `<option ${m.statut === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
          <div class="field"><label for="f-groupes">Groupes</label><input id="f-groupes" name="groupes" type="text" placeholder="Ex. : chorale, jeunesse" value="${esc(m.groupes)}"></div>
        </fieldset>
        <div id="ferr" class="err" role="alert"></div>
        <div style="height:4px"></div>
      </form>
      <div class="foot"><button type="submit" form="mform" class="btn primary block">${editing ? 'Enregistrer les modifications' : fromPointage ? 'Enregistrer et pointer présent' : 'Enregistrer le membre'}</button></div>`;

    const form = document.getElementById('mform');
    form.querySelectorAll('[data-seg]').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      g.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      form.elements[g.dataset.seg].value = b.dataset.v;
      if (g.dataset.seg === 'baptise') document.getElementById('bapt-date').hidden = b.dataset.v !== 'oui';
      if (g.dataset.seg === 'culte' && document.getElementById('transfer')) document.getElementById('transfer').hidden = b.dataset.v === editing.culte;
    }));
    form.querySelectorAll('[data-photo]').forEach((inp) => inp.addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try {
        ui.formPhoto = await readPhoto(f);
        const prev = form.querySelector('.ph132');
        prev.outerHTML = `<div class="ph ph132"><img src="${ui.formPhoto}" alt="Nouvelle photo"></div>`;
      } catch (err) { toast(err.message); }
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(form).entries());
      for (const k of Object.keys(fd)) fd[k] = String(fd[k]).trim();
      fd.nom = fd.nom.toUpperCase();
      const missing = [];
      if (!fd.nom) missing.push('le nom');
      if (!fd.prenoms) missing.push('les prénoms');
      if (!fd.sexe) missing.push('le sexe');
      if (!fd.tel) missing.push('le téléphone');
      else { const dg = fd.tel.replace(/\D/g, '').length; if (dg < 8 || dg > 15) missing.push('un numéro de téléphone complet (8 chiffres, ex. 70 12 34 56)'); }
      if (!fd.baptise) missing.push("le baptême d'eau");
      if (!fd.dateArrivee) missing.push("la date d'arrivée");
      if (!fd.culte) missing.push("le culte d'appartenance");
      const errBox = document.getElementById('ferr');
      if (missing.length) { errBox.textContent = 'À compléter : ' + missing.join(', ') + '.'; errBox.scrollIntoView({ block: 'center' }); return; }
      if (fd.baptise !== 'oui') fd.dateBapteme = '';
      if (fromPointage && !editing && fd.dateArrivee > openService().date) {
        errBox.textContent = `La date d'arrivée ne peut pas être après la date du culte en cours (${fmtShort(openService().date)}).`;
        errBox.scrollIntoView({ block: 'center' }); return;
      }
      const transferDate = fd.dateTransfert; delete fd.dateTransfert;
      let hist = null;
      if (editing && editing.culte && fd.culte !== editing.culte) {
        const d = transferDate || today();
        if (d < fd.dateArrivee) { errBox.textContent = "La date du transfert ne peut pas être avant la date d'arrivée."; errBox.scrollIntoView({ block: 'center' }); return; }
        hist = (editing.culteHistory && editing.culteHistory.length ? editing.culteHistory.slice() : [{ culte: editing.culte, from: '0000-01-01' }]).filter((x) => x.from < d);
        hist.push({ culte: fd.culte, from: d });
      }
      if (!editing && !ui.dupOk) {
        const telDigits = fd.tel.replace(/\D/g, '').slice(-8);
        const dup = DB.list('members').find((x) => norm(x.nom + x.prenoms) === norm(fd.nom + fd.prenoms) || (telDigits && (x.tel || '').replace(/\D/g, '').slice(-8) === telDigits));
        if (dup) {
          errBox.innerHTML = `Un membre semblable existe déjà : <a href="#/membre/${dup.id}">${esc(fullName(dup))}</a>${dup.actif === false ? ' (marqué parti)' : ''}. Appuyez de nouveau sur Enregistrer pour créer quand même la fiche.`;
          ui.dupOk = true; errBox.scrollIntoView({ block: 'center' }); return;
        }
      }
      ui.dupOk = false;
      const rec = Object.assign({}, editing || { id: uid(), createdAt: openService() && fromPointage ? openService().date : today(), actif: true }, fd);
      if (hist) rec.culteHistory = hist;
      await DB.put('members', rec);
      // Rappels ouverts portant sur des cultes antérieurs à l'arrivée : sans objet
      for (const a of openAlerts().filter((x) => x.memberId === rec.id && x.dates.some((d) => d < rec.dateArrivee))) {
        await DB.put('alerts', Object.assign({}, a, { status: 'done', kind: 'Autre', note: "Annulé : cultes antérieurs à la date d'arrivée", doneAt: today() }));
      }
      if (ui.formPhoto) await savePhoto(rec.id, ui.formPhoto);
      ui.formPhoto = null; ui.formFor = null;
      if (editing) await refreshAlerts();
      if (fromPointage && !editing) {
        await setStatus(openService().id, rec.id, 'P');
        toast(`${fullName(rec)} enregistré(e) et pointé(e) présent(e)`);
        go('#/pointage');
      } else {
        toast(editing ? 'Fiche mise à jour' : 'Membre enregistré');
        go(`#/membre/${rec.id}`);
      }
    });
  }

  /* ================= RAPPELS ================= */
  function waNumber(tel) {
    let d = String(tel || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 8) d = '226' + d;
    return d;
  }
  function reminderText(m) {
    const tpl = DB.setting('messageRappel', DEFAULT_MSG);
    return tpl.replace(/\{prenom\}/g, (m.prenoms || '').split(' ')[0]).replace(/\{nom\}/g, m.nom || '');
  }
  const DEFAULT_MSG = "Bonjour {prenom}, nous avons remarqué votre absence aux deux derniers cultes du TCO. Vous nous avez manqué ! Nous espérons que tout va bien pour vous et votre famille. Que Dieu vous bénisse. — Le service d'accueil";

  function viewRappels() {
    const all = DB.list('alerts').sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const todo = all.filter((a) => a.status === 'open');
    const done = all.filter((a) => a.status === 'done');
    const list = ui.rTab === 'open' ? todo : done;
    $app.innerHTML = `
      <header class="head light">
        ${KICKER}
        <h1>Rappels d'absence</h1>
        <p class="sub muted" style="margin:0">Membres absents sans excuse à 2 cultes du dimanche successifs.</p>
        <div class="tabs" role="group" aria-label="Choisir la liste" style="margin-top:10px">
          <button type="button" data-act="rtab" data-k="open" aria-pressed="${ui.rTab === 'open'}">À traiter (${todo.length})</button>
          <button type="button" data-act="rtab" data-k="done" aria-pressed="${ui.rTab === 'done'}">Traités (${done.length})</button>
        </div>
      </header>
      <div class="wrap"><ul class="list">${list.length ? list.map(alertCard).join('') : `<li class="empty">${ui.rTab === 'open' ? 'Aucun rappel à traiter.' : 'Aucun rappel traité pour le moment.'}</li>`}</ul></div>`;
  }

  function alertCard(a) {
    const m = DB.get('members', a.memberId);
    if (!m) return '';
    const open = a.status === 'open';
    const tel = m.tel || '';
    const text = encodeURIComponent(reminderText(m));
    const editing = ui.editing === a.id;
    return `<li class="card" style="display:flex;flex-direction:column;gap:12px;padding:14px">
      <div class="row" style="gap:12px;align-items:center">
        ${photoHtml(m, 56)}
        <a class="who" href="#/membre/${m.id}" style="flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;text-decoration:none;color:inherit">
          <span style="font-size:17px;font-weight:700">${esc(fullName(m))}</span>
          <span class="small muted">${esc([m.culte ? CULTE_SHORT[m.culte] : '', m.zone ? 'Zone ' + m.zone : '', tel].filter(Boolean).join(' · '))}</span>
          ${open ? `<span class="tag warn">Absent les ${esc(a.dates.map(fmtShort).join(' et '))}</span>`
                 : `<span class="tag ok">Traité · ${esc(a.kind)} le ${esc(fmtShort(a.doneAt))}</span>`}
        </a>
      </div>
      ${!open && a.note ? `<div class="small" style="background:#F6F5F1;border-radius:10px;padding:10px 12px">${esc(a.note)}</div>` : ''}
      ${open ? `<div class="grid3">
          <a class="btn primary sm" href="tel:${esc(telHref(tel))}">${ICON.phone}Appeler</a>
          <a class="btn ghost sm" href="sms:${esc(telHref(tel))}?body=${text}">${ICON.msg}SMS</a>
          <a class="btn ghost sm" href="https://wa.me/${waNumber(tel)}?text=${text}">WhatsApp</a>
        </div>
        ${editing ? `<form data-alert="${a.id}" style="border-top:1px solid var(--line);padding-top:12px;display:flex;flex-direction:column;gap:10px">
            <span class="lbl" style="color:var(--ink);font-size:14px;font-weight:700">Suite donnée</span>
            <div class="seg" role="group" aria-label="Type de suite">${['Appel', 'Visite', 'Message', 'Autre'].map((k) => `<button type="button" data-act="kind" data-k="${k}" aria-pressed="${ui.kind === k}">${k}</button>`).join('')}</div>
            <div class="field"><label for="note-${a.id}">Compte rendu</label><textarea id="note-${a.id}" rows="3" placeholder="Ex. : en voyage, revient dimanche prochain"></textarea></div>
            <div class="row"><button type="button" class="btn ghost sm" style="flex:1" data-act="edit-cancel">Annuler</button>
            <button type="submit" class="btn primary sm" style="flex:2">Enregistrer et clore</button></div>
          </form>` : `<button type="button" class="btn soft sm" data-act="edit" data-id="${a.id}">Noter la suite donnée</button>`}` : ''}
    </li>`;
  }

  /* ================= BILANS ================= */
  // Périodes : mensuel, trimestriel, annuel — par type de rencontre et par culte (tous, français, Jula Moré)
  const QNAMES = ['1er trimestre', '2e trimestre', '3e trimestre', '4e trimestre'];
  const QMONTHS = ['janv.–mars', 'avr.–juin', 'juil.–sept.', 'oct.–déc.'];
  const quarterOf = (ym) => `${ym.slice(0, 4)}-T${Math.floor((Number(ym.slice(5, 7)) - 1) / 3) + 1}`;
  const fmtDM = (d) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
  const CODE = (s) => { const k = svcKind(s); return k === 'enseignement' ? 'ENS' : k === 'priere' ? 'PRI' : k === 'activite' ? 'JS' : svcA(s) === 'fr' ? 'FR' : svcA(s) === 'jm' ? 'JM' : 'COM'; };

  function initBilanUi() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    if (!ui.bMonth) ui.bMonth = ym;
    if (!ui.bQuarter) ui.bQuarter = quarterOf(ym);
    if (!ui.bYear) ui.bYear = String(now.getFullYear());
    if (!ui.bCulte) ui.bCulte = 'all';
    if (!ui.bKind) ui.bKind = 'culte';
    return ym;
  }

  function period() {
    if (ui.bMode === 'month') {
      return { months: [ui.bMonth], key: ui.bMonth, title: `${cap(MONTHS[Number(ui.bMonth.slice(5)) - 1])} ${ui.bMonth.slice(0, 4)}` };
    }
    if (ui.bMode === 'quarter') {
      const y = ui.bQuarter.slice(0, 4), q = Number(ui.bQuarter.slice(-1));
      return { months: [0, 1, 2].map((i) => `${y}-${pad((q - 1) * 3 + i + 1)}`), key: ui.bQuarter, title: `${QNAMES[q - 1]} ${y} (${QMONTHS[q - 1]})` };
    }
    return { months: MONTHS.map((_, i) => `${ui.bYear}-${pad(i + 1)}`), key: ui.bYear, title: `Année ${ui.bYear}` };
  }

  // Membres concernés : tous (partis compris, pour leurs rencontres d'avant le départ), ou ceux qui ont fait partie du culte choisi
  const everIn = (m, f) => m.culte === f || (m.culteHistory || []).some((x) => x.culte === f);
  const bMembers = () => allMembers().filter((m) => ui.bCulte === 'all' || everIn(m, ui.bCulte));
  const inCulte = (s) => ui.bCulte === 'all' || svcA(s) === 'commun' || svcA(s) === ui.bCulte;
  // Rencontres communes : comptées dans le bilan d'un culte pour les membres qui en faisaient partie à cette date
  const servicesFor = (m, list) => ui.bCulte === 'all' ? list : list.filter((s) => svcA(s) !== 'commun' || culteAt(m, s.date) === ui.bCulte);

  function periodServices(months) {
    const base = ui.bKind === 'culte' ? countedClosed().filter(inCulte) : services().filter((s) => s.closed && svcKind(s) === ui.bKind);
    return base.filter((s) => months.includes(s.date.slice(0, 7)));
  }

  function bilanSubtitle() {
    return ui.bKind === 'culte'
      ? (ui.bCulte === 'all' ? 'Tous les cultes' : CULTES[ui.bCulte] + ' (cultes communs inclus)')
      : `${KINDS[ui.bKind]} · ${ui.bCulte === 'all' ? 'tous les membres' : 'membres du ' + CULTES[ui.bCulte].toLowerCase()}`;
  }

  function computeBilan() {
    const per = period();
    const list = periodServices(per.months);
    const members = bMembers();
    const ids = new Set(members.map((m) => m.id));
    const rows = members.map((m) => ({ m, st: memberStats(m, servicesFor(m, list)) })).filter((r) => r.st.denom > 0)
      .sort((x, y) => byName(x.m, y.m));
    const sumP = rows.reduce((t, r) => t + r.st.P, 0);
    const sumD = rows.reduce((t, r) => t + r.st.denom, 0);
    const presentBy = new Map();
    for (const p of DB.list('presences')) if (p.status === 'P') { if (!presentBy.has(p.serviceId)) presentBy.set(p.serviceId, []); presentBy.get(p.serviceId).push(p.memberId); }
    const perService = list.map((s) => {
      const n = (presentBy.get(s.id) || []).filter((id) => {
        if (!ids.has(id)) return false;
        if (ui.bCulte === 'all' || svcA(s) !== 'commun') return true;
        const m = DB.get('members', id); return m && culteAt(m, s.date) === ui.bCulte;
      }).length;
      const x = extras(s);
      return { s, n, v: x.v, e: x.e, total: n + x.v + x.e };
    });
    const alerts = DB.list('alerts').filter((a) => per.months.includes(a.createdAt.slice(0, 7)) && ids.has(a.memberId));
    const byMonth = per.months.map((ym) => {
      const sv = list.filter((s) => s.date.startsWith(ym));
      let P = 0, D = 0;
      for (const r of rows) { const st = memberStats(r.m, servicesFor(r.m, sv)); P += st.P; D += st.denom; }
      return { ym, rate: D ? P / D : null, n: sv.length };
    });
    const sum = (k) => perService.reduce((t, x) => t + x[k], 0);
    const avg = (k) => (perService.length ? Math.round(sum(k) / perService.length) : 0);
    return { per, list, rows, rate: sumD ? sumP / sumD : null, perService, alerts, byMonth,
      avgN: avg('n'), avgTotal: avg('total'), sumV: sum('v'), sumE: sum('e'), sumN: sum('n'), sumTotal: sum('total') };
  }

  function bilanFilters(months, quarters, years) {
    const sel = ui.bMode === 'month'
      ? `<label for="bper">Mois</label><select id="bper">${months.map((x) => `<option value="${x}" ${x === ui.bMonth ? 'selected' : ''}>${cap(MONTHS[Number(x.slice(5)) - 1])} ${x.slice(0, 4)}</option>`).join('')}</select>`
      : ui.bMode === 'quarter'
        ? `<label for="bper">Trimestre</label><select id="bper">${quarters.map((x) => `<option value="${x}" ${x === ui.bQuarter ? 'selected' : ''}>${QNAMES[Number(x.slice(-1)) - 1]} ${x.slice(0, 4)}</option>`).join('')}</select>`
        : `<label for="bper">Année</label><select id="bper">${years.map((x) => `<option ${x === ui.bYear ? 'selected' : ''}>${x}</option>`).join('')}</select>`;
    return `<div class="tabs noprint" role="group" aria-label="Période du bilan" style="margin-top:8px">
          <button type="button" data-act="bmode" data-k="month" aria-pressed="${ui.bMode === 'month'}">Mensuel</button>
          <button type="button" data-act="bmode" data-k="quarter" aria-pressed="${ui.bMode === 'quarter'}">Trimestriel</button>
          <button type="button" data-act="bmode" data-k="year" aria-pressed="${ui.bMode === 'year'}">Annuel</button>
        </div>
        <div class="seg noprint" role="group" aria-label="Culte" style="margin-top:8px">
          <button type="button" data-act="bculte" data-k="all" aria-pressed="${ui.bCulte === 'all'}">Tous</button>
          <button type="button" data-act="bculte" data-k="fr" aria-pressed="${ui.bCulte === 'fr'}">Français</button>
          <button type="button" data-act="bculte" data-k="jm" aria-pressed="${ui.bCulte === 'jm'}">Jula Moré</button>
        </div>
        <div class="noprint grid2" style="margin-top:8px">
          <div class="field"><label for="bkind">Rencontres</label><select id="bkind">${Object.keys(KINDS).map((k) => `<option value="${k}" ${k === ui.bKind ? 'selected' : ''}>${{ culte: 'Cultes', enseignement: 'Enseignements (mer.)', priere: 'Prières (ven.)', activite: 'Journées spéciales' }[k]}</option>`).join('')}</select></div>
          <div class="field">${sel}</div>
        </div>`;
  }
  function bindBilanFilters() {
    document.getElementById('bkind').addEventListener('change', (e) => { ui.bKind = e.target.value; render(); });
    document.getElementById('bper').addEventListener('change', (e) => {
      if (ui.bMode === 'month') ui.bMonth = e.target.value; else if (ui.bMode === 'quarter') ui.bQuarter = e.target.value; else ui.bYear = e.target.value;
      render();
    });
  }
  function periodLists(ym) {
    const svMonths = services().map((s) => s.date.slice(0, 7));
    return [
      [...new Set([ym, ...svMonths])].sort().reverse(),
      [...new Set([quarterOf(ym), ...svMonths.map(quarterOf)])].sort().reverse(),
      [...new Set([ym.slice(0, 4), ...svMonths.map((x) => x.slice(0, 4))])].sort().reverse()
    ];
  }
  const goneTag = (m) => (m.actif === false ? ' <span class="small muted">(parti)</span>' : '');

  function viewBilans() {
    const ym = initBilanUi();
    const isCulte = ui.bKind === 'culte';
    const [months, quarters, years] = periodLists(ym);
    const seuil = Number(DB.setting('seuil', 50)) / 100;
    const b = computeBilan();
    const low = b.rows.filter((r) => r.st.rate != null && r.st.rate < seuil).sort((x, y) => x.st.rate - y.st.rate);
    const maxT = Math.max(1, ...b.perService.map((x) => x.total));

    const group = (keyFn) => {
      const g = {};
      for (const r of b.rows) { const k = keyFn(r.m) || 'Non renseigné'; g[k] = g[k] || { P: 0, D: 0, n: 0 }; g[k].P += r.st.P; g[k].D += r.st.denom; g[k].n++; }
      return Object.entries(g).sort((a, c) => a[0].localeCompare(c[0]));
    };
    const groupCard = (title, entries) => `<section class="card"><h3 style="margin-bottom:4px">${title}</h3><dl class="dl">${entries.map(([k, v]) => `<div><dt>${esc(k)} (${v.n})</dt><dd>${pct(v.D ? v.P / v.D : null)}</dd></div>`).join('') || '<div><dt>—</dt><dd></dd></div>'}</dl></section>`;

    const perCard = `<section class="card" style="display:flex;flex-direction:column;gap:12px">
        <h3>Présents par rencontre</h3>
        ${b.perService.length ? b.perService.map((x) => `<div><div class="row between small" style="font-size:14px;gap:8px"><span>${esc(cap(fmtDate(x.s.date, { weekday: 'short', day: 'numeric', month: 'short' })))} · ${esc(svcName(x.s))}</span><strong>${x.total}</strong></div>
          <div class="small muted">${x.n} membre${x.n > 1 ? 's' : ''} · ${x.v} non enregistré${x.v > 1 ? 's' : ''} · ${x.e} enfant${x.e > 1 ? 's' : ''}</div>
          <div class="hbar" style="margin-top:4px"><i style="width:${Math.round(x.total / maxT * 100)}%"></i></div></div>`).join('') : '<div class="small muted">Aucune rencontre clôturée sur cette période.</div>'}
      </section>`;
    let extra = '';
    if (ui.bMode === 'month') {
      extra = perCard;
    } else {
      const n = b.byMonth.length;
      const dist = { reg: 0, occ: 0, dec: 0 };
      for (const r of b.rows) { if (r.st.rate == null) continue; if (r.st.rate >= 0.8) dist.reg++; else if (r.st.rate >= 0.5) dist.occ++; else dist.dec++; }
      const colStyle = `grid-template-columns:repeat(${n},minmax(0,1fr))`;
      const lab = (x) => n === 12 ? MONTH_INI[Number(x.ym.slice(5)) - 1] : cap(MONTHS[Number(x.ym.slice(5)) - 1]);
      extra = `<section class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Taux de participation par mois</h3>
          <div class="cols" style="${colStyle}">${b.byMonth.map((x) => `<div><span>${x.rate == null ? '' : Math.round(x.rate * 100) + (n === 12 ? '' : ' %')}</span><i style="height:${x.rate == null ? 0 : Math.max(2, Math.round(x.rate * 120))}px"></i></div>`).join('')}</div>
          <div class="collabels" style="${colStyle}">${b.byMonth.map((x) => `<span>${lab(x)}</span>`).join('')}</div>
        </section>
        <section class="card"><h3 style="margin-bottom:4px">Répartition des membres</h3>
          <dl class="dl"><div><dt>Réguliers (80 % et plus)</dt><dd>${dist.reg}</dd></div><div><dt>Occasionnels (50 à 79 %)</dt><dd>${dist.occ}</dd></div><div><dt>Décrochés (moins de 50 %)</dt><dd>${dist.dec}</dd></div></dl></section>
        ${ui.bKind === 'activite' ? perCard : ''}
        ${ui.bCulte === 'all' ? groupCard('Par culte', group((m) => m.culte ? CULTES[m.culte] : '')) : ''}
        ${groupCard('Par zone', group((m) => m.zone))}
        ${groupCard('Par sexe', group((m) => m.sexe))}`;
    }

    $app.innerHTML = `
      <header class="head light">
        <div class="row between">${KICKER}<a class="iconbtn noprint" href="#/reglages" aria-label="Réglages">${ICON.gear}</a></div>
        <h1>Bilans de participation</h1>
        ${bilanFilters(months, quarters, years)}
      </header>
      <div class="wrap">
        <div><h2 style="font-size:20px">${esc(b.per.title)}</h2><div class="small muted">${esc(bilanSubtitle())}</div></div>
        <a class="btn primary block noprint" href="#/grandbilan">Grand bilan : tableau complet des présences</a>
        <div class="grid2">
          <div class="tile"><b>${b.list.length}</b><span>${isCulte ? 'cultes comptés' : 'rencontres pointées'}</span></div>
          <div class="tile"><b>${pct(b.rate)}</b><span>taux de participation des membres</span></div>
          <div class="tile"><b>${b.avgN}</b><span>membres présents en moyenne</span></div>
          <div class="tile"><b>${b.avgTotal}</b><span>personnes présentes en moyenne (total)</span></div>
          <div class="tile"><b>${b.sumV} · ${b.sumE}</b><span>non enregistrés · enfants (cumul)</span></div>
          ${isCulte ? `<div class="tile"><b>${b.alerts.length}</b><span>rappels d'absence créés</span></div>` : `<div class="tile"><b>${b.rows.length}</b><span>membres concernés</span></div>`}
        </div>
        ${extra}
        <section class="card" style="display:flex;flex-direction:column;gap:6px">
          <h3>Membres sous ${Math.round(seuil * 100)} %</h3>
          ${low.length ? low.map((r) => `<a href="#/membre/${r.m.id}" class="row" style="padding:6px 0;border-top:1px solid #EFEDE7;text-decoration:none;color:inherit">
            ${photoHtml(r.m, 40)}<span style="flex:1;font-weight:600">${esc(fullName(r.m))}${goneTag(r.m)}</span><span class="low">${pct(r.st.rate)}</span></a>`).join('') : '<div class="small muted">Aucun membre sous le seuil.</div>'}
        </section>
        <section class="card">
          <h3 style="margin-bottom:6px">Détail par membre</h3>
          ${b.rows.length ? `<div style="overflow-x:auto"><table class="rates"><thead><tr><th>Membre</th><th class="num">Prés.</th><th class="num">Abs.</th><th class="num">dont exc.</th><th class="num">Taux</th></tr></thead><tbody>
            ${b.rows.map((r) => `<tr><td>${esc(fullName(r.m))}${goneTag(r.m)}</td><td class="num">${r.st.P}/${r.st.denom}</td><td class="num">${r.st.abs}</td><td class="num">${r.st.E}</td><td class="num ${r.st.rate != null && r.st.rate < seuil ? 'low' : ''}">${pct(r.st.rate)}</td></tr>`).join('')}
          </tbody></table></div><p class="small muted" style="margin:8px 0 0">Une absence excusée compte comme absence. Elle n’entraîne pas de rappel.</p>` : '<div class="small muted">Pas encore de données sur cette période.</div>'}
        </section>
      </div>
      <div class="foot"><button type="button" class="btn dark" style="flex:1" data-act="pdf">Exporter en PDF</button>
        <button type="button" class="btn ghost" style="flex:1;border-color:var(--ink);color:var(--ink)" data-act="csv">Exporter en Excel</button></div>`;
    bindBilanFilters();
  }

  function fileKey(b, prefix) {
    const suffix = ui.bCulte === 'all' ? '' : '-' + (ui.bCulte === 'fr' ? 'francais' : 'jula-more');
    const kindSuffix = ui.bKind === 'culte' ? '' : '-' + ui.bKind;
    return `${prefix}-${b.per.key}${kindSuffix}${suffix}.csv`;
  }

  function exportCsv() {
    const b = computeBilan();
    const rows = [['Bilan de participation — TCO', KINDS[ui.bKind], b.per.title, bilanSubtitle()], [],
      ['Nom', 'Prénoms', 'Culte', 'Sexe', 'Zone', 'Statut', "Baptisé(e) d'eau", 'Présences', 'Absences (total)', 'dont excusées', 'Rencontres', 'Taux (%)', 'Parti(e)']];
    for (const r of b.rows) {
      rows.push([r.m.nom, r.m.prenoms, r.m.culte ? CULTE_SHORT[r.m.culte] : 'À préciser', r.m.sexe, r.m.zone, r.m.statut, r.m.baptise, r.st.P, r.st.abs, r.st.E, r.st.denom, r.st.rate == null ? '' : Math.round(r.st.rate * 100), r.m.actif === false ? 'oui' : '']);
    }
    rows.push([], ['Rencontre', 'Date', 'Membres présents', 'Non enregistrés', 'Enfants', 'Total présents']);
    for (const x of b.perService) rows.push([svcName(x.s), x.s.date, x.n, x.v, x.e, x.total]);
    rows.push(['Total', '', b.sumN, b.sumV, b.sumE, b.sumTotal]);
    saveText(fileKey(b, 'bilan-presences'), 'text/csv', toCsv(rows));
  }

  /* ---------- Grand bilan : tous les membres × chaque rencontre ---------- */
  function gridCell(m, s) {
    if (!servicesFor(m, [s]).length || !eligible(m, s)) return '';
    return (presence(s.id, m.id) || { status: 'A' }).status;
  }

  function viewGrandBilan() {
    const ym = initBilanUi();
    const [months, quarters, years] = periodLists(ym);
    const b = computeBilan();
    const cols = b.list;
    const dense = cols.length > 26 ? ' dense' : '';
    $app.innerHTML = `
      <div class="bar noprint"><a class="iconbtn" href="#/bilans" aria-label="Retour aux bilans">${ICON.back}</a><h1>Grand bilan</h1></div>
      <header class="head light noprint" style="padding-top:4px">${bilanFilters(months, quarters, years)}</header>
      <div class="wrap gb-wrap">
        <div class="noprint"><h2 style="font-size:20px">Grand bilan des présences · ${esc(b.per.title)}</h2><div class="small muted">TCO · ${esc(bilanSubtitle())}</div></div>
        <div class="row noprint" style="gap:8px"><button type="button" class="btn dark sm" style="flex:1" data-act="gb-pdf">Exporter en PDF</button><button type="button" class="btn ghost sm" style="flex:1" data-act="gb-csv">Exporter en Excel</button></div>
        <p class="small muted noprint" style="margin:0">P présent · A absent · E excusé (compté absent) · case vide : rencontre qui ne concerne pas le membre. FR français · JM Jula Moré · COM commun · ENS enseignement · PRI prière · JS journée spéciale.</p>
        <div id="gbPrint" class="print-only"></div>
        ${cols.length && b.rows.length ? `<div class="gb-scroll gb-screen"><table class="gb${dense}">
          <thead><tr><th class="gb-name">Membre</th>${cols.map((s) => `<th title="${esc(svcName(s))}"><span>${fmtDM(s.date)}</span><span class="gb-code">${CODE(s)}</span></th>`).join('')}<th class="gb-tot">Prés.</th><th class="gb-tot">Abs.</th><th class="gb-tot">dont exc.</th><th class="gb-tot">Taux</th></tr></thead>
          <tbody>${b.rows.map((r) => `<tr><th class="gb-name">${esc(fullName(r.m))}${r.m.actif === false ? ' (parti)' : ''}</th>${cols.map((s) => { const c = gridCell(r.m, s); return `<td class="c${c}">${c}</td>`; }).join('')}<td class="gb-tot">${r.st.P}</td><td class="gb-tot">${r.st.abs}</td><td class="gb-tot">${r.st.E}</td><td class="gb-tot">${pct(r.st.rate)}</td></tr>`).join('')}</tbody>
          <tfoot>
            <tr><th class="gb-name">Membres présents</th>${b.perService.map((x) => `<td>${x.n}</td>`).join('')}<td class="gb-tot">${b.sumN}</td><td class="gb-tot" colspan="3"></td></tr>
            <tr><th class="gb-name">Non enregistrés</th>${b.perService.map((x) => `<td>${x.v}</td>`).join('')}<td class="gb-tot">${b.sumV}</td><td class="gb-tot" colspan="3"></td></tr>
            <tr><th class="gb-name">Enfants</th>${b.perService.map((x) => `<td>${x.e}</td>`).join('')}<td class="gb-tot">${b.sumE}</td><td class="gb-tot" colspan="3"></td></tr>
            <tr class="gb-total"><th class="gb-name">Total présents</th>${b.perService.map((x) => `<td>${x.total}</td>`).join('')}<td>${b.sumTotal}</td><td colspan="3"></td></tr>
          </tfoot></table></div>` : '<div class="empty">Aucune rencontre clôturée sur cette période.</div>'}
      </div>`;
    bindBilanFilters();
  }

  function exportGrandCsv() {
    const b = computeBilan();
    const cols = b.list;
    const rows = [['Grand bilan des présences — TCO', KINDS[ui.bKind], b.per.title, bilanSubtitle()], [],
      ['Nom', 'Prénoms', 'Culte'].concat(cols.map((s) => `${fmtDM(s.date)} ${svcName(s)}`), ['Présences', 'Absences (total)', 'dont excusées', 'Taux (%)'])];
    for (const r of b.rows) {
      rows.push([r.m.nom + (r.m.actif === false ? ' (parti)' : ''), r.m.prenoms, r.m.culte ? CULTE_SHORT[r.m.culte] : 'À préciser']
        .concat(cols.map((s) => gridCell(r.m, s)), [r.st.P, r.st.abs, r.st.E, r.st.rate == null ? '' : Math.round(r.st.rate * 100)]));
    }
    rows.push([]);
    rows.push(['Membres présents', '', ''].concat(b.perService.map((x) => x.n), [b.sumN]));
    rows.push(['Non enregistrés', '', ''].concat(b.perService.map((x) => x.v), [b.sumV]));
    rows.push(['Enfants', '', ''].concat(b.perService.map((x) => x.e), [b.sumE]));
    rows.push(['Total présents', '', ''].concat(b.perService.map((x) => x.total), [b.sumTotal]));
    rows.push([], ['Légende : P présent, A absent, E excusé (compté absent), case vide = rencontre qui ne concerne pas le membre']);
    saveText(fileKey(b, 'grand-bilan'), 'text/csv', toCsv(rows));
  }

  // Version imprimable du grand bilan : les colonnes sont réparties sur plusieurs pages paysage
  const GB_COLS_PER_PAGE = 26;
  function buildGrandPrint() {
    const box = document.getElementById('gbPrint'); if (!box) return;
    const b = computeBilan();
    const cols = b.list;
    // Colonnes réparties à parts égales entre les pages (au plus 26 par page)
    const per = Math.ceil(cols.length / Math.max(1, Math.ceil(cols.length / GB_COLS_PER_PAGE)));
    const parts = [];
    for (let i = 0; i < cols.length; i += per) parts.push(cols.slice(i, i + per));
    if (!parts.length) { box.innerHTML = ''; return; }
    box.innerHTML = parts.map((part, pi) => {
      const last = pi === parts.length - 1;
      const ps = b.perService.slice(pi * per, pi * per + part.length);
      const foot = (label, key, total) => `<tr${key === 'total' ? ' class="gb-total"' : ''}><th class="gb-name">${label}</th>${ps.map((x) => `<td>${x[key]}</td>`).join('')}${last ? `<td class="gb-tot">${total}</td><td class="gb-tot" colspan="3"></td>` : ''}</tr>`;
      return `<section class="gb-page">
        <h2 style="font-size:14px;margin:0 0 2px">Grand bilan des présences · ${esc(b.per.title)}${parts.length > 1 ? ` · page ${pi + 1}/${parts.length}` : ''}</h2>
        <p style="font-size:10px;margin:0 0 6px">TCO · ${esc(bilanSubtitle())} · P présent, A absent, E excusé (compté absent), case vide : rencontre qui ne concerne pas le membre.</p>
        <table class="gb gbp"><thead><tr><th class="gb-name">Membre</th>${part.map((s) => `<th><span>${fmtDM(s.date)}</span><span class="gb-code">${CODE(s)}</span></th>`).join('')}${last ? '<th class="gb-tot">Prés.</th><th class="gb-tot">Abs.</th><th class="gb-tot">dont exc.</th><th class="gb-tot">Taux</th>' : ''}</tr></thead>
        <tbody>${b.rows.map((r) => `<tr><th class="gb-name">${esc(fullName(r.m))}${r.m.actif === false ? ' (parti)' : ''}</th>${part.map((s) => { const c = gridCell(r.m, s); return `<td class="c${c}">${c}</td>`; }).join('')}${last ? `<td class="gb-tot">${r.st.P}</td><td class="gb-tot">${r.st.abs}</td><td class="gb-tot">${r.st.E}</td><td class="gb-tot">${pct(r.st.rate)}</td>` : ''}</tr>`).join('')}</tbody>
        <tfoot>${foot('Membres présents', 'n', b.sumN)}${foot('Non enregistrés', 'v', b.sumV)}${foot('Enfants', 'e', b.sumE)}${foot('Total présents', 'total', b.sumTotal)}</tfoot></table>
      </section>`;
    }).join('');
  }

  /* ---------- Sauvegarde protégée par mot de passe (AES-GCM, clé dérivée par PBKDF2) ---------- */
  const b64enc = (buf) => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };
  const b64dec = (str) => { const s = atob(str); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
  async function deriveKey(pw, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  // Clé publique de l'administrateur : chaque sauvegarde peut aussi être ouverte avec le mot de passe administrateur.
  const ADMIN_PUB = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAsWX7TR1wSSiJyqEOAJ6deq4RpPFvpU8/QoS1Mkvbzzn+uqAUyWAZJKB1ukzFixXLSmCv3zLRek8s3xPYir61/x3zYRn2W+u7SSXkxIpy/1x6k9FRqU8+zB4xNDdQRfuOtpLkJHE0mUOt3ForLPnHB1bVZFEWBvLtMTdlvWVRYlPuHOHO81dBq3GeGu3o7gbnO4s6dGAipesdN+qSr38CkNYlSMMvWA5BTF1QyYxD+MgShLW/NAMVLmhnq8J8tIBBq9KB0eh+t/TaT7D1wY+GOKuSUma7eLZANEsE4D+ia4lgbpG+n6+qL5rk5pJFVz1E4fsOLHhs9iQiPNj2LZC0twIDAQAB';
  const adminReady = () => !!(window.TCO_ADMIN && window.TCO_ADMIN.key);
  async function encryptBackup(obj, pw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), kiv = crypto.getRandomValues(new Uint8Array(12));
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const dk = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dk, new TextEncoder().encode(JSON.stringify(obj)));
    const pwKey = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: kiv }, await deriveKey(pw, salt), raw);
    const pub = await crypto.subtle.importKey('spki', b64dec(ADMIN_PUB), { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const admKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, pub, raw);
    return JSON.stringify({ app: 'tco-presences', enc: 'aes-gcm-pbkdf2-v2', exportedAt: obj.exportedAt, salt: b64enc(salt), kiv: b64enc(kiv), pwKey: b64enc(pwKey), admKey: b64enc(admKey), iv: b64enc(iv), data: b64enc(ct) });
  }
  async function openWithRaw(w, raw) {
    const dk = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(w.iv) }, dk, b64dec(w.data));
    return JSON.parse(new TextDecoder().decode(pt));
  }
  async function decryptBackup(w, pw) {
    try {
      if (w.enc === 'aes-gcm-pbkdf2-v2') {
        const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(w.kiv) }, await deriveKey(pw, b64dec(w.salt)), b64dec(w.pwKey));
        return await openWithRaw(w, raw);
      }
      const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(w.iv) }, await deriveKey(pw, b64dec(w.salt)), b64dec(w.data));
      return JSON.parse(new TextDecoder().decode(pt));
    } catch (e) { throw new Error('Mot de passe incorrect.'); }
  }

  /* ---------- Mot de passe administrateur ----------
     Il débloque le code d'accès oublié et les sauvegardes dont le mot de passe est oublié.
     L'application ne contient que la clé privée de l'administrateur chiffrée par ce mot de passe. */
  function adminWait() {
    const until = Number(DB.setting('adminWaitUntil', 0)) || 0;
    if (Date.now() >= until) return '';
    const sec = Math.ceil((until - Date.now()) / 1000);
    return `Trop d’essais. Réessayez dans ${sec > 90 ? Math.ceil(sec / 60) + ' minutes' : sec + ' secondes'}.`;
  }
  // Renvoie la clé privée si le mot de passe est juste, sinon lève une erreur avec un message clair
  async function adminKey(pw) {
    if (!adminReady()) throw new Error('Le déblocage administrateur n’est pas activé dans cette version de l’application.');
    const w = adminWait(); if (w) throw new Error(w);
    const A = window.TCO_ADMIN;
    try {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
      const k = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64dec(A.salt), iterations: A.iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      const der = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(A.iv) }, k, b64dec(A.key));
      await DB.setSetting('adminFails', 0); await DB.setSetting('adminWaitUntil', 0);
      return await crypto.subtle.importKey('pkcs8', der, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
    } catch (e) {
      const fails = (Number(DB.setting('adminFails', 0)) || 0) + 1;
      await DB.setSetting('adminFails', fails);
      if (fails % 5 === 0) await DB.setSetting('adminWaitUntil', Date.now() + Math.min(3600, 30 * 2 ** (fails / 5 - 1)) * 1000);
      throw new Error(fails % 5 === 0 ? 'Mot de passe administrateur incorrect. Trop d’essais : patientez avant de réessayer.' : 'Mot de passe administrateur incorrect.');
    }
  }
  async function adminOpenBackup(w, pw) {
    if (w.enc !== 'aes-gcm-pbkdf2-v2' || !w.admKey) throw new Error('Cette sauvegarde a été faite avant la version 2.2 : seul son propre mot de passe peut l’ouvrir.');
    const priv = await adminKey(pw);
    try { return await openWithRaw(w, await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, priv, b64dec(w.admKey))); }
    catch (e) { throw new Error('Cette sauvegarde ne peut pas être ouverte avec le mot de passe administrateur.'); }
  }
  // Contrôle d'une sauvegarde avant restauration : seules des données au bon format sont gardées
  function cleanBackup(d) {
    if (!d || d.app !== 'tco-presences' || !Array.isArray(d.members) || !Array.isArray(d.services)) throw new Error("Ce fichier n'est pas une sauvegarde TCO Présences valide.");
    const okId = (x) => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x);
    const okDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
    d.members = d.members.filter((m) => m && okId(m.id) && typeof m.nom === 'string');
    d.services = d.services.filter((s) => s && okId(s.id) && okDate(s.date));
    d.photos = (d.photos || []).filter((p) => p && okId(p.memberId) && typeof p.data === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p.data));
    d.presences = (d.presences || []).filter((p) => p && okId(p.serviceId) && okId(p.memberId) && ['P', 'A', 'E'].includes(p.status) && p.id === `${p.serviceId}|${p.memberId}`);
    d.alerts = (d.alerts || []).filter((a) => a && okId(a.id) && okId(a.memberId));
    d.settings = (d.settings || []).filter((x) => x && typeof x.key === 'string').map((x) => (x.key === 'events'
      ? { key: 'events', value: (Array.isArray(x.value) ? x.value : []).filter((ev) => ev && okId(ev.id) && Array.isArray(ev.days)).map((ev) => Object.assign({}, ev, { days: ev.days.filter((dd) => dd && okDate(dd.date)) })) }
      : x));
    return d;
  }

  function backupCard() {
    const nM = DB.list('members').length, nS = services().length;
    return `<section class="card" style="display:flex;flex-direction:column;gap:10px">
          <h2>Sauvegarde des données</h2>
          <p class="small muted" style="margin:0">Les données sont enregistrées sur ce téléphone uniquement (${nM} membre${nM > 1 ? 's' : ''}, ${nS} rencontre${nS > 1 ? 's' : ''}). Faites une sauvegarde chaque semaine et gardez-la en lieu sûr, ou utilisez-la pour transférer les données sur un autre téléphone.</p>
          <form id="bkForm" style="display:flex;flex-direction:column;gap:10px" novalidate>
            <div class="grid2">
              <div class="field"><label for="bk-pw">Mot de passe</label><input id="bk-pw" type="password" autocomplete="new-password"></div>
              <div class="field"><label for="bk-pw2">Confirmer</label><input id="bk-pw2" type="password" autocomplete="new-password"></div>
            </div>
            <span class="small muted">Au moins 6 caractères. La sauvegarde est chiffrée : il faut ce mot de passe pour l’ouvrir. Notez-le. En cas d’oubli, seul l’administrateur peut la débloquer.</span>
            <div id="bkerr" class="err" role="alert"></div>
            <button class="btn ghost" type="submit">Créer une sauvegarde protégée</button>
          </form>
          <label class="btn ghost" style="margin:0">Restaurer une sauvegarde<input type="file" accept="application/json,.json" id="restore" hidden></label>
          <div id="rbox" style="display:flex;flex-direction:column;gap:10px"></div>
          <div id="rerr" class="err" role="alert"></div>
          <p class="small muted" style="margin:0">Les exports Excel et PDF des bilans ne sont pas protégés : ne les partagez qu’avec les responsables.</p>
        </section>`;
  }

  function bindBackupCard() {
    document.getElementById('bkForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = document.getElementById('bk-pw').value, b = document.getElementById('bk-pw2').value;
      const err = document.getElementById('bkerr');
      if (a.length < 6) { err.textContent = 'Le mot de passe doit contenir au moins 6 caractères.'; return; }
      if (a !== b) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
      err.textContent = '';
      toast('Préparation de la sauvegarde…');
      saveText(`sauvegarde-tco-presences-${today()}.json`, 'application/json', await encryptBackup(DB.dump(), a));
      document.getElementById('bk-pw').value = ''; document.getElementById('bk-pw2').value = '';
    });
    const rbox = document.getElementById('rbox'), rerr = document.getElementById('rerr');
    // Étape finale : résumé et confirmation avant de remplacer les données
    const confirmRestore = (data) => {
      const when = data.exportedAt ? fmtDate(data.exportedAt.slice(0, 10), { day: 'numeric', month: 'long', year: 'numeric' }) : 'date inconnue';
      const nM = DB.list('members').length, nS = services().length;
      rbox.innerHTML = `<div class="banner warn"><strong>Remplacer toutes les données ?</strong><br>
        Sauvegarde du ${esc(when)} : ${data.members.length} membres, ${data.services.length} rencontres.<br>
        Elle remplacera les données actuelles de ce téléphone (${nM} membres, ${nS} rencontres), qui seront perdues.</div>
        <div class="row"><button type="button" class="btn ghost sm" style="flex:1" id="r-cancel">Annuler</button>
        <button type="button" class="btn danger sm" style="flex:1" id="r-ok">Remplacer les données</button></div>`;
      document.getElementById('r-cancel').addEventListener('click', () => { rbox.innerHTML = ''; });
      document.getElementById('r-ok').addEventListener('click', async () => {
        await DB.restore(data);
        setSecure(pinSet());
        toast('Sauvegarde restaurée'); go('#/pointage');
      });
    };
    document.getElementById('restore').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      e.target.value = '';
      rbox.innerHTML = ''; rerr.textContent = '';
      const fr = new FileReader();
      fr.onload = () => {
        const txt = String(fr.result || '').replace(/^﻿/, '').trim();
        if (/^(Bilan de participation|Grand bilan)/.test(txt) || f.name.toLowerCase().endsWith('.csv')) {
          rerr.textContent = "Ce fichier est un bilan (export Excel), pas une sauvegarde. Choisissez le fichier « sauvegarde-tco-presences-….json » (dossier Téléchargements › TCO Presences).";
          return;
        }
        let w;
        try { w = JSON.parse(txt); } catch (err) { rerr.textContent = "Ce fichier n'est pas une sauvegarde TCO Présences. Choisissez le fichier « sauvegarde-tco-presences-….json »."; return; }
        if (w && w.app === 'tco-presences' && w.enc) {
          rbox.innerHTML = `<div class="field"><label for="r-pw">Mot de passe de la sauvegarde</label><input id="r-pw" type="password" autocomplete="off"></div>
            <button type="button" class="btn primary sm" id="r-open">Ouvrir la sauvegarde</button>
            <button type="button" class="lock-link dark" id="r-forgot">Mot de passe oublié ? Ouvrir avec le mot de passe administrateur</button>
            <div id="r-adm" class="r-adm" hidden>
              <div class="field"><label for="r-apw">Mot de passe administrateur</label><input id="r-apw" type="password" autocomplete="off"></div>
              <button type="button" class="btn ghost sm" id="r-aopen">Ouvrir avec le mot de passe administrateur</button></div>`;
          document.getElementById('r-pw').focus();
          document.getElementById('r-open').addEventListener('click', async () => {
            rerr.textContent = '';
            try { confirmRestore(cleanBackup(await decryptBackup(w, document.getElementById('r-pw').value))); } catch (err) { rerr.textContent = err.message; }
          });
          document.getElementById('r-forgot').addEventListener('click', () => { const b = document.getElementById('r-adm'); b.hidden = false; document.getElementById('r-apw').focus(); });
          document.getElementById('r-aopen').addEventListener('click', async () => {
            rerr.textContent = ''; toast('Vérification…');
            try { confirmRestore(cleanBackup(await adminOpenBackup(w, document.getElementById('r-apw').value))); } catch (err) { rerr.textContent = err.message; }
          });
          return;
        }
        try { confirmRestore(cleanBackup(w)); } catch (err) { rerr.textContent = err.message; }
      };
      fr.readAsText(f);
    });
  }

  /* ================= RÉGLAGES ================= */
  function viewReglages() {
    const nM = DB.list('members').length, nS = services().length;
    $app.innerHTML = `
      <div class="bar"><a class="iconbtn" href="#/pointage" aria-label="Retour">${ICON.back}</a><h1>Réglages</h1></div>
      <div class="wrap">
        <form class="card" id="sform" style="display:flex;flex-direction:column;gap:12px">
          <h2>Bilans et rappels</h2>
          <div class="field"><label for="seuil">Seuil de participation (en %)</label><input id="seuil" type="number" min="0" max="100" value="${esc(DB.setting('seuil', 50))}"></div>
          <div class="field"><label for="msg">Message de rappel (SMS / WhatsApp)</label><textarea id="msg" rows="5">${esc(DB.setting('messageRappel', DEFAULT_MSG))}</textarea>
            <span class="small muted" style="margin-top:4px">{prenom} est remplacé par le prénom du membre.</span></div>
          <button class="btn primary" type="submit">Enregistrer</button>
        </form>
        ${pinCard()}
        ${backupCard()}
        <p class="small muted" style="text-align:center">TCO Présences · version 2.3</p>
      </div>`;
    document.getElementById('sform').addEventListener('submit', async (e) => {
      e.preventDefault();
      await DB.setSetting('seuil', Math.max(0, Math.min(100, Number(document.getElementById('seuil').value) || 50)));
      await DB.setSetting('messageRappel', document.getElementById('msg').value.trim() || DEFAULT_MSG);
      toast('Réglages enregistrés');
    });
    bindPinCard();
    bindBackupCard();
  }

  /* ================= CODE D'ACCÈS ================= */
  // Code de 4 à 6 chiffres demandé à l'ouverture et après 5 minutes en arrière-plan.
  // Un code de secours (donné une seule fois) permet de le désactiver en cas d'oubli.
  async function sha(text) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  const pinSet = () => !!DB.setting('pinHash', null);
  const pinOk = async (pin) => (await sha(DB.setting('pinSalt', '') + pin)) === DB.setting('pinHash', '');
  let locked = false, hiddenAt = 0;

  async function setPin(pin) {
    const salt = uid();
    const rec = Array.from(crypto.getRandomValues(new Uint8Array(8))).map((x) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[x % 32]).join('');
    await DB.setSetting('pinSalt', salt);
    await DB.setSetting('pinHash', await sha(salt + pin));
    await DB.setSetting('recoveryHash', await sha(salt + 'R' + rec));
    await DB.setSetting('pinFails', 0); await DB.setSetting('pinWaitUntil', 0);
    setSecure(true);
    return rec.slice(0, 4) + '-' + rec.slice(4);
  }
  async function clearPin() { for (const k of ['pinHash', 'pinSalt', 'recoveryHash', 'pinWaitUntil']) await DB.setSetting(k, null); await DB.setSetting('pinFails', 0); setSecure(false); }

  function showLock(after) {
    locked = true;
    const box = document.getElementById('lock');
    document.body.classList.add('locked');
    box.hidden = false;
    box.innerHTML = `<div class="lock-in">
      <span class="lock-logo"><img src="logo.png" alt=""></span>
      <h1>TCO Présences</h1>
      <form id="lockForm" class="lock-form" novalidate>
        <label for="lockPin">Code d’accès</label>
        <input id="lockPin" type="password" inputmode="numeric" autocomplete="off" maxlength="6">
        <div id="lockErr" class="lock-err" role="alert"></div>
        <button class="btn block lock-btn" type="submit">Déverrouiller</button>
      </form>
      <button type="button" class="lock-link" id="lockForgot">Code oublié ?</button>
      <form id="recForm" class="lock-form" hidden novalidate>
        <label for="recCode">Code de secours (donné à la création du code)</label>
        <input id="recCode" type="text" autocomplete="off" autocapitalize="characters" placeholder="XXXX-XXXX">
        <div id="recErr" class="lock-err" role="alert"></div>
        <button class="btn block lock-btn" type="submit">Désactiver le code</button>
        <button type="button" class="lock-link" id="lockAdmin">Pas de code de secours ? Déblocage par l’administrateur</button>
      </form>
      <form id="admForm" class="lock-form" hidden novalidate>
        <label for="admPw">Mot de passe administrateur</label>
        <input id="admPw" type="password" autocomplete="off">
        <div id="admErr" class="lock-err" role="alert"></div>
        <button class="btn block lock-btn" type="submit">Débloquer</button>
      </form></div>`;
    const pin = document.getElementById('lockPin');
    setTimeout(() => pin.focus(), 60);
    document.getElementById('lockForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('lockErr');
      const waitUntil = Number(DB.setting('pinWaitUntil', 0)) || 0;
      if (Date.now() < waitUntil) {
        const sec = Math.ceil((waitUntil - Date.now()) / 1000);
        err.textContent = `Trop d’essais. Réessayez dans ${sec > 90 ? Math.ceil(sec / 60) + ' minutes' : sec + ' secondes'}.`; return;
      }
      if (!(await pinOk(pin.value))) {
        const fails = (Number(DB.setting('pinFails', 0)) || 0) + 1; pin.value = '';
        await DB.setSetting('pinFails', fails);
        // Attente qui double à chaque série de 5 erreurs : 30 s, 1 min, 2 min… jusqu'à 1 heure
        if (fails % 5 === 0) await DB.setSetting('pinWaitUntil', Date.now() + Math.min(3600, 30 * 2 ** (fails / 5 - 1)) * 1000);
        err.textContent = fails % 5 === 0 ? 'Code incorrect. Trop d’essais : patientez avant de réessayer.' : `Code incorrect. Encore ${5 - (fails % 5)} essai(s) avant une attente.`; return;
      }
      await DB.setSetting('pinFails', 0); await DB.setSetting('pinWaitUntil', 0);
      unlock(after);
    });
    document.getElementById('lockForgot').addEventListener('click', () => { document.getElementById('recForm').hidden = false; document.getElementById('recCode').focus(); });
    document.getElementById('recForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = document.getElementById('recCode').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if ((await sha(DB.setting('pinSalt', '') + 'R' + code)) !== DB.setting('recoveryHash', '')) { document.getElementById('recErr').textContent = 'Code de secours incorrect.'; return; }
      await clearPin(); unlock(after); toast('Code d’accès désactivé. Vous pouvez en créer un nouveau dans les Réglages.');
    });
    document.getElementById('lockAdmin').addEventListener('click', () => { document.getElementById('recForm').hidden = true; document.getElementById('admForm').hidden = false; document.getElementById('admPw').focus(); });
    document.getElementById('admForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const er = document.getElementById('admErr'); er.textContent = 'Vérification…';
      try { await adminKey(document.getElementById('admPw').value); }
      catch (err) { er.textContent = err.message; document.getElementById('admPw').value = ''; return; }
      await clearPin(); unlock(() => go('#/reglages')); toast('Débloqué par l’administrateur. Choisissez un nouveau code d’accès.');
    });
  }
  function unlock(after) {
    locked = false;
    const box = document.getElementById('lock');
    box.hidden = true; box.innerHTML = '';
    document.body.classList.remove('locked');
    if (after) after();
  }
  document.addEventListener('visibilitychange', () => {
    if (!ready) return;
    if (document.hidden) hiddenAt = Date.now();
    else if (!locked && hiddenAt && Date.now() - hiddenAt > 5 * 60 * 1000 && pinSet()) showLock();
  });

  function pinCard() {
    if (ui.recoveryCode) {
      return `<section class="card" style="display:flex;flex-direction:column;gap:10px">
        <h2>Code d’accès activé</h2>
        <div class="banner warn"><strong>Notez ce code de secours et gardez-le en lieu sûr :</strong>
          <div style="font-size:26px;font-weight:800;letter-spacing:3px;margin-top:6px">${esc(ui.recoveryCode)}</div>
          Il permet de désactiver le code d’accès si vous l’oubliez. Il ne sera plus jamais affiché.</div>
        <button type="button" class="btn primary" data-act="rec-done">J’ai noté le code de secours</button></section>`;
    }
    const on = pinSet();
    return `<form class="card" id="pinForm" style="display:flex;flex-direction:column;gap:12px" novalidate>
        <h2>Code d’accès</h2>
        <p class="small muted" style="margin:0">${on ? 'L’application est protégée par un code (4 à 6 chiffres), demandé à l’ouverture et après 5 minutes d’inactivité.' : 'Protégez les informations des membres : un code (4 à 6 chiffres) sera demandé à l’ouverture de l’application.'}</p>
        ${on ? '<div class="field"><label for="pin-cur">Code actuel</label><input id="pin-cur" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>' : ''}
        <div class="grid2">
          <div class="field"><label for="pin-new">${on ? 'Nouveau code' : 'Code'}</label><input id="pin-new" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
          <div class="field"><label for="pin-new2">Confirmer</label><input id="pin-new2" type="password" inputmode="numeric" maxlength="6" autocomplete="off"></div>
        </div>
        <div id="pin-err" class="err" role="alert"></div>
        <button class="btn primary" type="submit">${on ? 'Changer le code' : 'Activer le code d’accès'}</button>
        ${on ? '<button type="button" class="btn danger" data-act="pin-off">Désactiver le code (code actuel requis)</button>' : ''}
      </form>`;
  }
  function bindPinCard() {
    const f = document.getElementById('pinForm'); if (!f) return;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = document.getElementById('pin-err');
      const cur = document.getElementById('pin-cur');
      const a = document.getElementById('pin-new').value, b = document.getElementById('pin-new2').value;
      if (cur && !(await pinOk(cur.value))) { err.textContent = 'Code actuel incorrect.'; return; }
      if (!/^\d{4,6}$/.test(a)) { err.textContent = 'Le code doit contenir 4 à 6 chiffres.'; return; }
      if (a !== b) { err.textContent = 'Les deux codes ne sont pas identiques.'; return; }
      ui.recoveryCode = await setPin(a);
      render();
    });
  }

  /* ---------- Actions (délégation) ---------- */
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.dataset.act;
    const s = openService();
    switch (act) {
      case 'filter': ui.filter = el.dataset.k; drawPointage(); break;
      case 'mark': {
        const cur = presence(s.id, el.dataset.id);
        await setStatus(s.id, el.dataset.id, cur && cur.status === 'P' ? null : 'P');
        drawPointage(); break;
      }
      case 'excuse': {
        const cur = presence(s.id, el.dataset.id);
        await setStatus(s.id, el.dataset.id, cur && cur.status === 'E' ? null : 'E');
        drawPointage(); break;
      }
      case 'close-arm': ui.closeArmed = true; drawPointage(); break;
      case 'close-cancel': ui.closeArmed = false; drawPointage(); break;
      case 'close-confirm': await closeService(); break;
      case 'reopen': {
        if (openService()) { toast("Clôturez d'abord la rencontre en cours"); break; }
        const sv = DB.get('services', el.dataset.id);
        // les absences automatiques redeviennent « non pointé » pour la correction
        const autoA = DB.list('presences').filter((p) => p.serviceId === sv.id && p.status === 'A');
        for (const p of autoA) await DB.del('presences', p.id);
        await DB.put('services', Object.assign({}, sv, { closed: false }));
        ui.lastClose = null; go('#/pointage'); break;
      }
      case 'cnt': {
        // La case est mise à jour tout de suite : chaque appui compte, même rapide
        const inp = document.getElementById('cnt-' + el.dataset.f);
        const v = num(num(inp && inp.value) + Number(el.dataset.d));
        if (inp) inp.value = v;
        await saveCount(el.dataset.f, v); break;
      }
      case 'sdel-arm': ui.delArmed = el.dataset.id; render(); break;
      case 'sdel-cancel': ui.delArmed = null; render(); break;
      case 'sdel-confirm': {
        const id = el.dataset.id;
        for (const pr of DB.list('presences').filter((x) => x.serviceId === id)) await DB.del('presences', pr.id);
        await DB.del('services', id);
        await refreshAlerts();
        ui.delArmed = null; ui.lastClose = null; toast('Rencontre supprimée'); go('#/historique'); break;
      }
      case 'gb-pdf': buildGrandPrint(); printPage('Grand bilan TCO', true); break;
      case 'gb-csv': exportGrandCsv(); break;
      case 'ev-edit': ui.evEdit = el.dataset.ev; render(); window.scrollTo(0, 0); break;
      case 'ev-cancel': ui.evEdit = null; render(); break;
      case 'pin-off': {
        const cur = document.getElementById('pin-cur');
        if (!cur || !(await pinOk(cur.value))) { document.getElementById('pin-err').textContent = 'Entrez le code actuel pour le désactiver.'; break; }
        await clearPin(); toast('Code d’accès désactivé'); render(); break;
      }
      case 'rec-done': ui.recoveryCode = null; toast('Code d’accès activé'); render(); break;
      case 'reactivate': {
        const m = DB.get('members', el.dataset.id);
        const deps = departs(m).map((d) => (d.to ? d : Object.assign({}, d, { to: today() })));
        await DB.put('members', Object.assign({}, m, { actif: true, partiLe: null, departs: deps }));
        toast(`${fullName(m)} est de nouveau actif(ve)`); render(); break;
      }
      case 'rtab': ui.rTab = el.dataset.k; ui.editing = null; render(); break;
      case 'edit': ui.editing = el.dataset.id; ui.kind = 'Appel'; render(); break;
      case 'edit-cancel': ui.editing = null; render(); break;
      case 'kind': ui.kind = el.dataset.k; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); break;
      case 'bmode': ui.bMode = el.dataset.k; render(); break;
      case 'bculte': ui.bCulte = el.dataset.k; render(); break;
      case 'open-day': await openEventDay(el.dataset.ev, el.dataset.date); break;
      case 'ev-del': {
        await DB.setSetting('events', (DB.setting('events', []) || []).filter((x) => x.id !== el.dataset.ev));
        toast('Journées supprimées'); render(); break;
      }
      case 'mculte': ui.mCulte = el.dataset.k; drawMembres(); break;
      case 'csv': exportCsv(); break;
      case 'pdf': printPage('Bilan TCO', false); break;
      case 'leave-arm': ui.leaveArmed = el.dataset.id; render(); break;
      case 'leave-cancel': ui.leaveArmed = false; render(); break;
      case 'leave-confirm': {
        const m = DB.get('members', el.dataset.id);
        const deps = departs(m).slice(); deps.push({ from: today(), to: null });
        await DB.put('members', Object.assign({}, m, { actif: false, partiLe: today(), departs: deps }));
        await refreshAlerts();
        ui.leaveArmed = false; toast(`${fullName(m)} marqué(e) comme parti(e)`); go('#/membres'); break;
      }
    }
  });
  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-alert]');
    if (!f) return;
    e.preventDefault();
    const a = DB.get('alerts', f.dataset.alert);
    const note = f.querySelector('textarea').value.trim();
    await DB.put('alerts', Object.assign({}, a, { status: 'done', kind: ui.kind, note, doneAt: today() }));
    ui.editing = null; toast('Rappel clos'); render();
  });

  document.addEventListener('change', (e) => {
    const inp = e.target.closest && e.target.closest('input[data-cnt]');
    if (inp) saveCount(inp.dataset.cnt, inp.value);
  });
  window.addEventListener('hashchange', () => { if (!ready) return; ui.closeArmed = false; ui.leaveArmed = false; ui.dupOk = false; ui.delArmed = null; render(); window.scrollTo(0, 0); });

  DB.init().then(() => { ready = true; setSecure(pinSet()); if (pinSet()) showLock(render); else render(); }).catch((err) => {
    $app.innerHTML = `<div class="wrap"><div class="banner warn">Impossible d'ouvrir les données : ${esc(err.message)}</div></div>`;
  });
})();
