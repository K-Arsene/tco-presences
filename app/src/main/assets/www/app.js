/* TCO Présences — application du service d'accueil
   Pointage des cultes, rappels après 2 absences successives, bilans mensuels et annuels. */
(function () {
  'use strict';
  const $app = document.getElementById('app');
  const NATIVE = window.TCOAndroid || null;

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

  const ICON = {
    check: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    plus: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    back: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    gear: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    phone: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    msg: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H8l-4 4z"/></svg>',
    camera: '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>'
  };

  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
  }

  function photoHtml(m, size) {
    const p = m && DB.get('photos', m.id);
    const label = m ? `Photo de ${esc(fullName(m))}` : 'Photo';
    if (p && p.data) return `<div class="ph ph${size}"><img src="${p.data}" alt="${label}"></div>`;
    return `<div class="ph ph${size}" role="img" aria-label="${label} (pas encore de photo)">${m ? esc(initials(m)) : ''}</div>`;
  }

  /* ---------- Données dérivées ---------- */
  const activeMembers = () => DB.list('members').filter((m) => m.actif !== false)
    .sort((a, b) => norm(a.nom + ' ' + a.prenoms).localeCompare(norm(b.nom + ' ' + b.prenoms)));
  const svcKey = (s) => `${s.date}T${s.time || '00:00'}`;
  const services = () => DB.list('services').sort((a, b) => svcKey(a).localeCompare(svcKey(b)));
  const openService = () => services().filter((s) => !s.closed).pop() || null;
  const presence = (sid, mid) => DB.get('presences', `${sid}|${mid}`);
  const eligible = (m, s) => (m.createdAt || '0000') <= s.date;
  const countedClosed = () => services().filter((s) => s.closed && s.counted);

  function lastCountedStatus(m, beforeService) {
    const list = countedClosed().filter((s) => eligible(m, s) && (!beforeService || svcKey(s) < svcKey(beforeService)));
    const s = list.pop();
    if (!s) return null;
    const p = presence(s.id, m.id);
    return p ? p.status : 'A';
  }

  function memberStats(m, list) {
    let P = 0, A = 0, E = 0;
    for (const s of list) {
      if (!eligible(m, s)) continue;
      const p = presence(s.id, m.id);
      const st = p ? p.status : 'A';
      if (st === 'P') P++; else if (st === 'E') E++; else A++;
    }
    const denom = P + A;
    return { P, A, E, denom, rate: denom ? P / denom : null };
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
  function printPage(title) {
    if (NATIVE && NATIVE.printPage) NATIVE.printPage(title); else window.print();
  }
  const csvCell = (v) => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
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
    const tab = { pointage: 'pointage', nouveau: 'pointage', reglages: 'pointage', rappels: 'rappels', membres: 'membres', membre: 'membres', modifier: 'membres', bilans: 'bilans' }[r.name] || 'pointage';
    document.querySelectorAll('#tabbar a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateBadge();
    const views = { pointage: viewPointage, rappels: viewRappels, membres: viewMembres, membre: viewFiche, nouveau: viewForm, modifier: viewForm, bilans: viewBilans, reglages: viewReglages };
    (views[r.name] || viewPointage)(r);
  }

  /* ================= POINTAGE ================= */
  function viewPointage() {
    const s = openService();
    if (!s) return viewOuvrir();
    $app.innerHTML = `
      <header class="head">
        <div class="row between"><div class="kicker">TCO · Service d'accueil</div>
          <a class="iconbtn noprint" href="#/reglages" aria-label="Réglages" style="color:#fff">${ICON.gear}</a></div>
        <h1>Pointage du culte</h1>
        <div class="sub">${esc(cap(fmtDate(s.date)))}${s.time ? ' · ' + esc(s.time.replace(':', ' h ')) : ''}</div>
        <div class="sub small">${esc(s.label || TYPES[s.type])}${s.counted ? '' : ' · non compté dans les bilans'}</div>
        <div class="pills" id="pcounts"></div>
      </header>
      <div class="wrap" style="padding-bottom:4px">
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

  function drawPointage() {
    const s = openService(); if (!s) return;
    const members = activeMembers().filter((m) => eligible(m, s));
    const st = (m) => { const p = presence(s.id, m.id); return p ? p.status : null; };
    const nP = members.filter((m) => st(m) === 'P').length;
    const nE = members.filter((m) => st(m) === 'E').length;
    const nRest = members.length - nP - nE;
    document.getElementById('pcounts').innerHTML =
      `<span class="pill">${nP} présent${nP > 1 ? 's' : ''}</span><span class="pill outline">${nRest} non pointé${nRest > 1 ? 's' : ''}</span>${nE ? `<span class="pill outline">${nE} excusé${nE > 1 ? 's' : ''}</span>` : ''}`;
    const filters = [['all', 'Tous'], ['out', 'Non pointés'], ['in', 'Présents'], ['exc', 'Excusés']];
    document.getElementById('pfilters').innerHTML = filters.map(([k, l]) =>
      `<button type="button" data-act="filter" data-k="${k}" aria-pressed="${ui.filter === k}">${l}</button>`).join('');
    const q = norm(ui.q);
    const shown = members.filter((m) => {
      if (q && !norm(fullName(m) + ' ' + m.nom + ' ' + (m.tel || '')).includes(q)) return false;
      const x = st(m);
      return ui.filter === 'all' || (ui.filter === 'in' && x === 'P') || (ui.filter === 'out' && !x) || (ui.filter === 'exc' && x === 'E');
    });
    const list = document.getElementById('plist');
    if (!members.length) {
      list.innerHTML = `<li class="empty">Aucun membre enregistré.<br><br><a class="btn primary" href="#/nouveau?from=pointage">${ICON.plus}Ajouter le premier membre</a></li>`;
    } else if (!shown.length) {
      list.innerHTML = '<li class="empty">Aucun membre ne correspond.</li>';
    } else {
      list.innerHTML = shown.map((m) => {
        const x = st(m);
        const prev = s.counted ? lastCountedStatus(m, s) : null;
        const info = [m.zone ? 'Zone ' + esc(m.zone) : '', prev === 'A' ? '<span class="tag warn">absent au culte précédent</span>' : ''].filter(Boolean).join(' · ');
        const main = x === 'P'
          ? `<button type="button" class="btn primary sm" data-act="mark" data-id="${m.id}" aria-pressed="true" aria-label="Retirer ${esc(fullName(m))} des présents">${ICON.check}Présent</button>`
          : x === 'E'
            ? `<button type="button" class="btn sm" style="background:#E3E1DA" data-act="mark" data-id="${m.id}" aria-label="Pointer ${esc(fullName(m))} présent">Excusé</button>`
            : `<button type="button" class="btn ghost sm" data-act="mark" data-id="${m.id}" aria-pressed="false" aria-label="Pointer ${esc(fullName(m))} présent">Pointer</button>`;
        const sec = x === 'E' ? 'Annuler l\'excuse' : 'Excuser';
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
         <button type="button" class="btn dark" style="flex:2" data-act="close-confirm">Confirmer : ${nRest} absent${nRest > 1 ? 's' : ''}</button>`
      : `<button type="button" class="btn dark block" data-act="close-arm">Clôturer le culte</button>`;
  }

  async function setStatus(sid, mid, status) {
    const id = `${sid}|${mid}`;
    if (!status) await DB.del('presences', id);
    else await DB.put('presences', { id, serviceId: sid, memberId: mid, status, at: new Date().toISOString() });
  }

  async function closeService() {
    const s = openService(); if (!s) return;
    const members = activeMembers().filter((m) => eligible(m, s));
    const absents = [];
    const writes = [];
    for (const m of members) {
      const p = presence(s.id, m.id);
      if (!p) writes.push({ id: `${s.id}|${m.id}`, serviceId: s.id, memberId: m.id, status: 'A', at: new Date().toISOString() });
      if (!p || p.status === 'A') absents.push(m);
    }
    if (writes.length) await DB.putMany('presences', writes);
    let newAlerts = 0;
    if (s.counted) {
      const open = new Set(openAlerts().map((a) => a.memberId));
      const prevServices = countedClosed().filter((x) => svcKey(x) < svcKey(s));
      for (const m of absents) {
        if (open.has(m.id)) continue;
        if (DB.list('alerts').some((a) => a.memberId === m.id && a.serviceIds.includes(s.id))) continue;
        const prev = prevServices.filter((x) => eligible(m, x)).pop();
        if (!prev) continue;
        const pp = presence(prev.id, m.id);
        if (!pp || pp.status === 'A') {
          await DB.put('alerts', { id: uid(), memberId: m.id, serviceIds: [prev.id, s.id], dates: [prev.date, s.date], createdAt: today(), status: 'open' });
          newAlerts++;
        }
      }
    }
    await DB.put('services', Object.assign({}, s, { closed: true, closedAt: new Date().toISOString() }));
    ui.closeArmed = false; ui.q = ''; ui.filter = 'all';
    ui.lastClose = { serviceId: s.id, absents: absents.length, presents: members.length - absents.length - members.filter((m) => (presence(s.id, m.id) || {}).status === 'E').length, alerts: newAlerts };
    render();
  }

  function viewOuvrir() {
    const lc = ui.lastClose;
    const recent = services().filter((s) => s.closed).slice(-6).reverse();
    const d = new Date();
    const isSunday = d.getDay() === 0;
    $app.innerHTML = `
      <header class="head">
        <div class="row between"><div class="kicker">TCO · Service d'accueil</div>
          <a class="iconbtn" href="#/reglages" aria-label="Réglages" style="color:#fff">${ICON.gear}</a></div>
        <h1>Pointage du culte</h1>
        <div class="sub">Aucun culte ouvert</div>
      </header>
      <div class="wrap">
        ${lc ? `<div class="banner warn" role="status"><strong>Culte clôturé.</strong> ${lc.presents} présent${lc.presents > 1 ? 's' : ''}, ${lc.absents} absent${lc.absents > 1 ? 's' : ''}.
          ${lc.alerts ? ` ${lc.alerts} rappel${lc.alerts > 1 ? 's' : ''} créé${lc.alerts > 1 ? 's' : ''} (2 absences successives). <a href="#/rappels"><strong>Voir les rappels</strong></a>` : ' Aucun nouveau rappel.'}</div>` : ''}
        <form class="card" id="openForm" style="display:flex;flex-direction:column;gap:12px">
          <h2>Ouvrir un culte</h2>
          <div class="grid2">
            <div class="field"><label for="sdate">Date</label><input id="sdate" type="date" value="${today()}" required></div>
            <div class="field"><label for="stime">Heure</label><input id="stime" type="time" value="${pad(d.getHours())}:00"></div>
          </div>
          <div class="field"><span class="lbl">Type de culte</span>
            <div class="seg" role="group" aria-label="Type de culte" id="stype">
              <button type="button" data-t="dimanche" aria-pressed="${isSunday}">Dimanche</button>
              <button type="button" data-t="semaine" aria-pressed="${!isSunday}">Semaine</button>
              <button type="button" data-t="special" aria-pressed="false">Spécial</button>
            </div></div>
          <div class="field"><label for="slabel">Intitulé (facultatif)</label><input id="slabel" type="text" placeholder="Ex. : 1er culte, veillée de prière"></div>
          <label class="row" style="color:var(--ink);font-size:15px;font-weight:600;margin:0;min-height:44px">
            <input id="scounted" type="checkbox" ${isSunday ? 'checked' : ''} style="width:22px;height:22px">
            Compter ce culte (bilans et règle des 2 absences)</label>
          <button class="btn primary block" type="submit">Ouvrir le pointage</button>
        </form>
        ${recent.length ? `<section class="card"><h2 style="margin-bottom:8px">Derniers cultes</h2>
          ${recent.map((s) => {
            const pr = DB.list('presences').filter((p) => p.serviceId === s.id);
            const nP = pr.filter((p) => p.status === 'P').length;
            return `<div class="row between" style="padding:8px 0;border-top:1px solid #EFEDE7">
              <div><div style="font-weight:700">${esc(cap(fmtDate(s.date, { weekday: 'short', day: 'numeric', month: 'short' })))}${s.time ? ' · ' + esc(s.time) : ''}</div>
              <div class="small muted">${esc(s.label || TYPES[s.type])} · ${nP} présent${nP > 1 ? 's' : ''}${s.counted ? '' : ' · non compté'}</div></div>
              <button type="button" class="btn ghost sm" data-act="reopen" data-id="${s.id}">Corriger</button></div>`;
          }).join('')}</section>` : ''}
      </div>`;
    const typeBtns = document.querySelectorAll('#stype button');
    typeBtns.forEach((b) => b.addEventListener('click', () => {
      typeBtns.forEach((x) => x.setAttribute('aria-pressed', x === b));
      document.getElementById('scounted').checked = b.dataset.t === 'dimanche';
    }));
    document.getElementById('openForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const date = document.getElementById('sdate').value || today();
      const type = (document.querySelector('#stype [aria-pressed="true"]') || {}).dataset?.t || 'dimanche';
      await DB.put('services', { id: uid(), date, time: document.getElementById('stime').value, type,
        label: document.getElementById('slabel').value.trim(), counted: document.getElementById('scounted').checked, closed: false });
      ui.lastClose = null; ui.q = ''; ui.filter = 'all';
      render();
    });
  }

  /* ================= MEMBRES ================= */
  function viewMembres() {
    const n = activeMembers().length;
    $app.innerHTML = `
      <header class="head light">
        <div class="kicker">TCO · Service d'accueil</div>
        <div class="row between"><h1>Membres</h1><a class="btn primary sm" href="#/nouveau">${ICON.plus}Nouveau</a></div>
        <div class="sub muted">${n} membre${n > 1 ? 's' : ''} actif${n > 1 ? 's' : ''}</div>
      </header>
      <div class="wrap">
        <label for="mq" style="margin:0">Rechercher</label>
        <input id="mq" type="search" placeholder="Nom, prénom, téléphone, zone" value="${esc(ui.mq)}" autocomplete="off">
        <ul class="list" id="mlist"></ul>
      </div>`;
    document.getElementById('mq').addEventListener('input', (e) => { ui.mq = e.target.value; drawMembres(); });
    drawMembres();
  }
  function drawMembres() {
    const q = norm(ui.mq);
    const list = activeMembers().filter((m) => !q || norm([m.nom, m.prenoms, m.tel, m.zone, m.quartier].join(' ')).includes(q));
    document.getElementById('mlist').innerHTML = list.length ? list.map((m) => `
      <li><a class="mrow" href="#/membre/${m.id}" style="text-decoration:none;color:inherit">
        ${photoHtml(m, 56)}
        <span class="who"><span class="name">${esc(fullName(m))}</span>
        <span class="info">${esc([m.statut, m.zone ? 'Zone ' + m.zone : ''].filter(Boolean).join(' · '))}</span></span>
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
      ['Téléphone', m.tel ? `<a href="tel:${esc(m.tel)}">${esc(m.tel)}</a>` : '—'],
      ['Sexe', esc(m.sexe || '—')],
      ['Quartier · zone', esc([m.quartier, m.zone ? 'Zone ' + m.zone : ''].filter(Boolean).join(' · ') || '—')],
      ['Église de provenance', esc(m.provenance || '—')],
      ["Baptisé(e) d'eau", bapt],
      ['Date de naissance', m.naissance ? esc(fmtDate(m.naissance, { day: 'numeric', month: 'long', year: 'numeric' })) : '—'],
      ['Situation familiale', esc(m.famille || '—')],
      ['Groupes', esc(m.groupes || '—')],
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
          <div class="row" style="flex-wrap:wrap;justify-content:center">
            ${m.statut ? `<span class="tag dark">${esc(m.statut)}</span>` : ''}
            ${m.baptise === 'oui' ? `<span class="tag ok">Baptisé(e) d'eau</span>` : ''}
          </div>
        </section>
        <section class="card" style="display:flex;flex-direction:column;gap:10px">
          <div class="row between"><h3>Participation aux cultes</h3><a href="#/bilans" class="small" style="font-weight:600">Voir les bilans</a></div>
          <div>${cap(MONTHS[now.getMonth()])} : <strong>${ms.P} culte${ms.P > 1 ? 's' : ''} sur ${ms.denom}</strong> (${pct(ms.rate)})${ms.E ? ` · ${ms.E} excusé${ms.E > 1 ? 's' : ''}` : ''}</div>
          <div class="small muted">Année ${now.getFullYear()} : ${yearStats.P} sur ${yearStats.denom} (${pct(yearStats.rate)})</div>
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
          ${ui.leaveArmed === m.id
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
            ${['Nouveau venu', 'Membre', 'Ouvrier'].map((v) => `<option ${m.statut === v ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
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
      if (!fd.baptise) missing.push("le baptême d'eau");
      const errBox = document.getElementById('ferr');
      if (missing.length) { errBox.textContent = 'À compléter : ' + missing.join(', ') + '.'; errBox.scrollIntoView({ block: 'center' }); return; }
      if (fd.baptise !== 'oui') fd.dateBapteme = '';
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
      await DB.put('members', rec);
      if (ui.formPhoto) await savePhoto(rec.id, ui.formPhoto);
      ui.formPhoto = null; ui.formFor = null;
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
        <div class="kicker">TCO · Service d'accueil</div>
        <h1>Rappels d'absence</h1>
        <p class="sub muted" style="margin:0">Membres absents à 2 cultes comptés successifs.</p>
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
          <span class="small muted">${esc([m.zone ? 'Zone ' + m.zone : '', tel].filter(Boolean).join(' · '))}</span>
          ${open ? `<span class="tag warn">Absent les ${esc(a.dates.map(fmtShort).join(' et '))}</span>`
                 : `<span class="tag ok">Traité · ${esc(a.kind)} le ${esc(fmtShort(a.doneAt))}</span>`}
        </a>
      </div>
      ${!open && a.note ? `<div class="small" style="background:#F6F5F1;border-radius:10px;padding:10px 12px">${esc(a.note)}</div>` : ''}
      ${open ? `<div class="grid3">
          <a class="btn primary sm" href="tel:${esc(tel)}">${ICON.phone}Appeler</a>
          <a class="btn ghost sm" href="sms:${esc(tel)}?body=${text}">${ICON.msg}SMS</a>
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
  function periodServices() {
    const list = countedClosed();
    if (ui.bMode === 'month') return list.filter((s) => s.date.startsWith(ui.bMonth));
    return list.filter((s) => s.date.startsWith(ui.bYear));
  }

  function computeBilan() {
    const list = periodServices();
    const members = activeMembers();
    const rows = members.map((m) => ({ m, st: memberStats(m, list) })).filter((r) => r.st.P + r.st.A + r.st.E > 0);
    const sumP = rows.reduce((t, r) => t + r.st.P, 0);
    const sumD = rows.reduce((t, r) => t + r.st.denom, 0);
    const perService = list.map((s) => ({ s, n: DB.list('presences').filter((p) => p.serviceId === s.id && p.status === 'P').length }));
    const prefix = ui.bMode === 'month' ? ui.bMonth : ui.bYear;
    const alerts = DB.list('alerts').filter((a) => a.createdAt.startsWith(prefix));
    return { list, rows, rate: sumD ? sumP / sumD : null, perService, alerts,
      avg: perService.length ? Math.round(perService.reduce((t, x) => t + x.n, 0) / perService.length) : 0 };
  }

  function viewBilans() {
    const now = new Date();
    const ym = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    if (!ui.bMonth) ui.bMonth = ym;
    if (!ui.bYear) ui.bYear = String(now.getFullYear());
    const months = [...new Set([ym, ...services().map((s) => s.date.slice(0, 7))])].sort().reverse();
    const years = [...new Set([String(now.getFullYear()), ...services().map((s) => s.date.slice(0, 4))])].sort().reverse();
    const seuil = Number(DB.setting('seuil', 50)) / 100;
    const b = computeBilan();
    const title = ui.bMode === 'month' ? `${cap(MONTHS[Number(ui.bMonth.slice(5)) - 1])} ${ui.bMonth.slice(0, 4)}` : `Année ${ui.bYear}`;
    const low = b.rows.filter((r) => r.st.rate != null && r.st.rate < seuil).sort((x, y) => x.st.rate - y.st.rate);
    const maxN = Math.max(1, ...b.perService.map((x) => x.n));

    let extra = '';
    if (ui.bMode === 'month') {
      extra = `<section class="card" style="display:flex;flex-direction:column;gap:12px">
        <h3>Présents par culte</h3>
        ${b.perService.length ? b.perService.map((x) => `<div><div class="row between small" style="font-size:14px"><span>${esc(cap(fmtDate(x.s.date, { weekday: 'long', day: 'numeric', month: 'short' })))}${x.s.label ? ' · ' + esc(x.s.label) : ''}</span><strong>${x.n}</strong></div>
          <div class="hbar" style="margin-top:4px"><i style="width:${Math.round(x.n / maxN * 100)}%"></i></div></div>`).join('') : '<div class="small muted">Aucun culte compté et clôturé sur cette période.</div>'}
      </section>`;
    } else {
      const byMonth = MONTHS.map((_, i) => {
        const pre = `${ui.bYear}-${pad(i + 1)}`;
        const sv = b.list.filter((s) => s.date.startsWith(pre));
        let P = 0, D = 0;
        for (const r of b.rows) { const st = memberStats(r.m, sv); P += st.P; D += st.denom; }
        return D ? P / D : null;
      });
      const dist = { reg: 0, occ: 0, dec: 0 };
      for (const r of b.rows) { if (r.st.rate == null) continue; if (r.st.rate >= 0.8) dist.reg++; else if (r.st.rate >= 0.5) dist.occ++; else dist.dec++; }
      const group = (key) => {
        const g = {};
        for (const r of b.rows) { const k = r.m[key] || 'Non renseigné'; g[k] = g[k] || { P: 0, D: 0, n: 0 }; g[k].P += r.st.P; g[k].D += r.st.denom; g[k].n++; }
        return Object.entries(g).sort((a, c) => a[0].localeCompare(c[0]));
      };
      extra = `<section class="card" style="display:flex;flex-direction:column;gap:10px">
          <h3>Taux de participation par mois</h3>
          <div class="cols">${byMonth.map((v) => `<div><span>${v == null ? '' : Math.round(v * 100)}</span><i style="height:${v == null ? 0 : Math.max(2, Math.round(v * 120))}px"></i></div>`).join('')}</div>
          <div class="collabels">${MONTH_INI.map((x) => `<span>${x}</span>`).join('')}</div>
        </section>
        <section class="card"><h3 style="margin-bottom:4px">Répartition des membres</h3>
          <dl class="dl"><div><dt>Réguliers (80 % et plus)</dt><dd>${dist.reg}</dd></div><div><dt>Occasionnels (50 à 79 %)</dt><dd>${dist.occ}</dd></div><div><dt>Décrochés (moins de 50 %)</dt><dd>${dist.dec}</dd></div></dl></section>
        <section class="card"><h3 style="margin-bottom:4px">Par zone</h3><dl class="dl">${group('zone').map(([k, v]) => `<div><dt>${esc(k)} (${v.n})</dt><dd>${pct(v.D ? v.P / v.D : null)}</dd></div>`).join('') || '<div><dt>—</dt><dd></dd></div>'}</dl></section>
        <section class="card"><h3 style="margin-bottom:4px">Par sexe</h3><dl class="dl">${group('sexe').map(([k, v]) => `<div><dt>${esc(k)} (${v.n})</dt><dd>${pct(v.D ? v.P / v.D : null)}</dd></div>`).join('') || '<div><dt>—</dt><dd></dd></div>'}</dl></section>`;
    }

    const table = b.rows.slice().sort((x, y) => norm(x.m.nom + x.m.prenoms).localeCompare(norm(y.m.nom + y.m.prenoms)));
    $app.innerHTML = `
      <header class="head light">
        <div class="row between"><div class="kicker">TCO · Service d'accueil</div><a class="iconbtn noprint" href="#/reglages" aria-label="Réglages">${ICON.gear}</a></div>
        <h1>Bilans de participation</h1>
        <div class="tabs noprint" role="group" aria-label="Période du bilan" style="margin-top:8px">
          <button type="button" data-act="bmode" data-k="month" aria-pressed="${ui.bMode === 'month'}">Mensuel</button>
          <button type="button" data-act="bmode" data-k="year" aria-pressed="${ui.bMode === 'year'}">Annuel</button>
        </div>
        <div class="noprint" style="margin-top:8px">${ui.bMode === 'month'
          ? `<label for="bper">Mois</label><select id="bper">${months.map((x) => `<option value="${x}" ${x === ui.bMonth ? 'selected' : ''}>${cap(MONTHS[Number(x.slice(5)) - 1])} ${x.slice(0, 4)}</option>`).join('')}</select>`
          : `<label for="bper">Année</label><select id="bper">${years.map((x) => `<option ${x === ui.bYear ? 'selected' : ''}>${x}</option>`).join('')}</select>`}</div>
      </header>
      <div class="wrap">
        <h2 style="font-size:20px">${esc(title)}</h2>
        <div class="grid2">
          <div class="tile"><b>${b.list.length}</b><span>cultes comptés</span></div>
          <div class="tile"><b>${pct(b.rate)}</b><span>taux de participation</span></div>
          <div class="tile"><b>${b.avg}</b><span>présents en moyenne par culte</span></div>
          <div class="tile"><b>${b.alerts.length}</b><span>rappels d'absence créés</span></div>
        </div>
        ${extra}
        <section class="card" style="display:flex;flex-direction:column;gap:6px">
          <h3>Membres sous ${Math.round(seuil * 100)} %</h3>
          ${low.length ? low.map((r) => `<a href="#/membre/${r.m.id}" class="row" style="padding:6px 0;border-top:1px solid #EFEDE7;text-decoration:none;color:inherit">
            ${photoHtml(r.m, 40)}<span style="flex:1;font-weight:600">${esc(fullName(r.m))}</span><span class="low">${pct(r.st.rate)}</span></a>`).join('') : '<div class="small muted">Aucun membre sous le seuil.</div>'}
        </section>
        <section class="card">
          <h3 style="margin-bottom:6px">Détail par membre</h3>
          ${table.length ? `<div style="overflow-x:auto"><table class="rates"><thead><tr><th>Membre</th><th class="num">Présent</th><th class="num">Excusé</th><th class="num">Taux</th></tr></thead><tbody>
            ${table.map((r) => `<tr><td>${esc(fullName(r.m))}</td><td class="num">${r.st.P}/${r.st.denom}</td><td class="num">${r.st.E}</td><td class="num ${r.st.rate != null && r.st.rate < seuil ? 'low' : ''}">${pct(r.st.rate)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="small muted">Pas encore de données sur cette période.</div>'}
        </section>
      </div>
      <div class="foot"><button type="button" class="btn dark" style="flex:1" data-act="pdf">Exporter en PDF</button>
        <button type="button" class="btn ghost" style="flex:1;border-color:var(--ink);color:var(--ink)" data-act="csv">Exporter en Excel</button></div>`;
    document.getElementById('bper').addEventListener('change', (e) => { if (ui.bMode === 'month') ui.bMonth = e.target.value; else ui.bYear = e.target.value; render(); });
  }

  function exportCsv() {
    const b = computeBilan();
    const label = ui.bMode === 'month' ? ui.bMonth : ui.bYear;
    const rows = [['Bilan de participation aux cultes — TCO', label], [],
      ['Nom', 'Prénoms', 'Sexe', 'Zone', 'Statut', "Baptisé(e) d'eau", 'Présences', 'Absences', 'Excusé', 'Cultes comptés', 'Taux (%)']];
    for (const r of b.rows.sort((x, y) => norm(x.m.nom + x.m.prenoms).localeCompare(norm(y.m.nom + y.m.prenoms)))) {
      rows.push([r.m.nom, r.m.prenoms, r.m.sexe, r.m.zone, r.m.statut, r.m.baptise, r.st.P, r.st.A, r.st.E, r.st.denom, r.st.rate == null ? '' : Math.round(r.st.rate * 100)]);
    }
    rows.push([], ['Culte', 'Date', 'Présents']);
    for (const x of b.perService) rows.push([x.s.label || TYPES[x.s.type], x.s.date, x.n]);
    saveText(`bilan-presences-${label}.csv`, 'text/csv', toCsv(rows));
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
        <section class="card" style="display:flex;flex-direction:column;gap:10px">
          <h2>Sauvegarde des données</h2>
          <p class="small muted" style="margin:0">Les données sont enregistrées sur ce téléphone uniquement (${nM} membre${nM > 1 ? 's' : ''}, ${nS} culte${nS > 1 ? 's' : ''}). Faites une sauvegarde chaque semaine et gardez-la en lieu sûr, ou utilisez-la pour transférer les données sur un autre téléphone.</p>
          <button type="button" class="btn ghost" data-act="backup">Créer une sauvegarde</button>
          <label class="btn ghost" style="margin:0">Restaurer une sauvegarde<input type="file" accept="application/json,.json" id="restore" hidden></label>
          <div id="rerr" class="err" role="alert"></div>
        </section>
        <p class="small muted" style="text-align:center">TCO Présences · version 1.0</p>
      </div>`;
    document.getElementById('sform').addEventListener('submit', async (e) => {
      e.preventDefault();
      await DB.setSetting('seuil', Math.max(0, Math.min(100, Number(document.getElementById('seuil').value) || 50)));
      await DB.setSetting('messageRappel', document.getElementById('msg').value.trim() || DEFAULT_MSG);
      toast('Réglages enregistrés');
    });
    document.getElementById('restore').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fr = new FileReader();
      fr.onload = async () => {
        try {
          const data = JSON.parse(fr.result);
          await DB.restore(data);
          toast('Sauvegarde restaurée'); go('#/pointage');
        } catch (err) { document.getElementById('rerr').textContent = 'Restauration impossible : ' + err.message; }
      };
      fr.readAsText(f);
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
        if (openService()) { toast("Clôturez d'abord le culte en cours"); break; }
        const sv = DB.get('services', el.dataset.id);
        // les absences automatiques redeviennent « non pointé » pour la correction
        const autoA = DB.list('presences').filter((p) => p.serviceId === sv.id && p.status === 'A');
        for (const p of autoA) await DB.del('presences', p.id);
        await DB.put('services', Object.assign({}, sv, { closed: false }));
        ui.lastClose = null; render(); break;
      }
      case 'rtab': ui.rTab = el.dataset.k; ui.editing = null; render(); break;
      case 'edit': ui.editing = el.dataset.id; ui.kind = 'Appel'; render(); break;
      case 'edit-cancel': ui.editing = null; render(); break;
      case 'kind': ui.kind = el.dataset.k; el.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b === el)); break;
      case 'bmode': ui.bMode = el.dataset.k; render(); break;
      case 'csv': exportCsv(); break;
      case 'pdf': printPage('Bilan TCO'); break;
      case 'backup': saveText(`sauvegarde-tco-presences-${today()}.json`, 'application/json', JSON.stringify(DB.dump())); break;
      case 'leave-arm': ui.leaveArmed = el.dataset.id; render(); break;
      case 'leave-cancel': ui.leaveArmed = false; render(); break;
      case 'leave-confirm': {
        const m = DB.get('members', el.dataset.id);
        await DB.put('members', Object.assign({}, m, { actif: false, partiLe: today() }));
        const al = openAlerts().filter((a) => a.memberId === m.id);
        for (const a of al) await DB.put('alerts', Object.assign({}, a, { status: 'done', kind: 'Autre', note: 'Membre marqué comme parti', doneAt: today() }));
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

  window.addEventListener('hashchange', () => { ui.closeArmed = false; ui.leaveArmed = false; ui.dupOk = false; render(); window.scrollTo(0, 0); });

  DB.init().then(render).catch((err) => {
    $app.innerHTML = `<div class="wrap"><div class="banner warn">Impossible d'ouvrir les données : ${esc(err.message)}</div></div>`;
  });
})();
