/* Stockage local (IndexedDB) — toutes les données restent sur le téléphone.
   Les données sont chargées en mémoire au démarrage puis écrites au fil de l'eau. */
(function () {
  const NAME = 'tco-presences';
  const VERSION = 1;
  const STORES = {
    members: 'id',      // fiches membres
    photos: 'memberId', // photo actuelle (dataURL JPEG) + historique des dates
    services: 'id',     // cultes
    presences: 'id',    // `${serviceId}|${memberId}`
    alerts: 'id',       // rappels d'absence
    settings: 'key'
  };
  let db = null;
  const mem = {};

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        for (const [s, key] of Object.entries(STORES)) {
          if (!d.objectStoreNames.contains(s)) d.createObjectStore(s, { keyPath: key });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function all(store) {
    return new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  function tx(store, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, 'readwrite');
      fn(t.objectStore(store));
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  const DB = {
    async init() {
      db = await open();
      for (const [s, key] of Object.entries(STORES)) {
        mem[s] = new Map((await all(s)).map((o) => [o[key], o]));
      }
    },
    list(store) { return [...mem[store].values()]; },
    get(store, id) { return mem[store].get(id); },
    async put(store, obj) {
      mem[store].set(obj[STORES[store]], obj);
      await tx(store, (os) => os.put(obj));
      return obj;
    },
    async putMany(store, objs) {
      for (const o of objs) mem[store].set(o[STORES[store]], o);
      await tx(store, (os) => objs.forEach((o) => os.put(o)));
    },
    async del(store, id) {
      mem[store].delete(id);
      await tx(store, (os) => os.delete(id));
    },
    setting(key, fallback) {
      const s = mem.settings.get(key);
      return s ? s.value : fallback;
    },
    async setSetting(key, value) { return DB.put('settings', { key, value }); },
    dump() {
      const out = { app: 'tco-presences', version: VERSION, exportedAt: new Date().toISOString() };
      for (const s of Object.keys(STORES)) out[s] = DB.list(s);
      return out;
    },
    async restore(data) {
      if (!data || data.app !== 'tco-presences') throw new Error('Fichier de sauvegarde non reconnu');
      for (const s of Object.keys(STORES)) {
        await tx(s, (os) => os.clear());
        mem[s] = new Map();
        if (Array.isArray(data[s])) await DB.putMany(s, data[s]);
      }
    }
  };
  window.DB = DB;
})();
