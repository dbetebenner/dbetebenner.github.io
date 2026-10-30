// Client-side filtering for the talks listing; state is mirrored to the query string so a
// filtered view can be linked (e.g. /talks/?year=2012&type=conference).
(() => {
  const q = document.getElementById('talk-q');
  if (!q) return;
  const selects = { year: 'talk-year', type: 'talk-type', format: 'talk-format' };
  const el = Object.fromEntries(Object.entries(selects).map(([k, id]) => [k, document.getElementById(id)]));
  const rows = [...document.querySelectorAll('.talk-row')];
  const count = document.getElementById('talk-count');

  const params = new URLSearchParams(location.search);
  if (params.get('q')) q.value = params.get('q');
  for (const k of Object.keys(el)) if (params.get(k)) el[k].value = params.get(k);

  function apply() {
    const needle = q.value.trim().toLowerCase();
    let shown = 0;
    for (const r of rows) {
      const ok =
        (!needle || r.dataset.text.includes(needle)) &&
        Object.entries(el).every(([k, s]) => !s.value || r.dataset[k] === s.value);
      r.hidden = !ok;
      if (ok) shown++;
    }
    count.textContent = shown;
    const next = new URLSearchParams();
    if (needle) next.set('q', q.value.trim());
    for (const [k, s] of Object.entries(el)) if (s.value) next.set(k, s.value);
    history.replaceState(null, '', next.toString() ? `?${next}` : location.pathname);
  }

  q.addEventListener('input', apply);
  for (const s of Object.values(el)) s.addEventListener('change', apply);
  apply();
})();
