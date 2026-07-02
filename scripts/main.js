/* =========================================================================
   main.js — punto de entrada de la aplicación.

   MÓDULOS ACTIVOS:
     - Tema claro/oscuro, acordeones, tabs de consola (interfaz general)
     - Drag & drop de componentes: biblioteca -> riel DIN
     - Reordenar / seleccionar / eliminar componentes ya colocados
     - Panel de propiedades: se completa con datos reales al seleccionar

   PENDIENTE PARA PRÓXIMAS ETAPAS:
     - Conexión de bornes (cables) entre componentes -> scripts/ui/
     - Motor de cálculo eléctrico (tensión, corriente, fallas) -> scripts/simulation/
     - Persistencia real de Guardar/Abrir/Exportar/Importar

   LIMITACIÓN CONOCIDA (v1): el riel tiene una capacidad fija de módulos
   (MAX_SLOTS). Cuando se complete la simulación real vamos a reemplazar
   esto por un riel de largo dinámico con scroll.
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* =====================================================================
     0. UI GENERAL (tema, acordeones, tabs de consola)
     ================================================================== */
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next);
  });

  document.querySelectorAll('.category-head').forEach((head) => {
    head.addEventListener('click', () => {
      head.parentElement.classList.toggle('collapsed');
    });
  });

  document.querySelectorAll('.console-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  const btnSimular = document.getElementById('btnSimular');
  const btnDetener = document.getElementById('btnDetener');
  const simIndicator = document.getElementById('simIndicator');
  const simStatusText = document.getElementById('simStatusText');
  btnSimular.addEventListener('click', () => {
    simIndicator.classList.remove('idle');
    simStatusText.textContent = 'Simulando…';
    btnDetener.disabled = false;
  });
  btnDetener.addEventListener('click', () => {
    simIndicator.classList.add('idle');
    simStatusText.textContent = 'Sin simular';
    btnDetener.disabled = true;
  });

  /* =====================================================================
     1. BIBLIOTECA DE COMPONENTES (leída directamente del DOM)
     ================================================================== */
  const LIBRARY = {};
  document.querySelectorAll('.comp-card').forEach((card) => {
    const type = card.dataset.component;
    LIBRARY[type] = {
      name: card.querySelector('.comp-name').textContent.trim(),
      spec: card.querySelector('.comp-spec').textContent.trim(),
      iconHTML: card.querySelector('.comp-icon').innerHTML,
    };
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/component-type', type);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });

  // Ancho relativo en "slots" de riel (aprox. proporcional a polos/tamaño físico)
  const WIDTHS = {
    'red-220v': 3, 'medidor': 2,
    'interruptor-general': 2, 'diferencial': 2, 'termica-unipolar': 1,
    'termica-bipolar': 2, 'dps': 1,
    'barra-fase': 6, 'barra-neutro': 6, 'barra-tierra': 6, 'peine': 4, 'bornera': 2,
    'iluminacion': 1, 'tomacorrientes': 1, 'aire-acondicionado': 2, 'reserva': 1,
  };

  const CATEGORY = {
    'red-220v': 'alimentacion', 'medidor': 'alimentacion',
    'interruptor-general': 'proteccion', 'diferencial': 'proteccion',
    'termica-unipolar': 'proteccion', 'termica-bipolar': 'proteccion', 'dps': 'proteccion',
    'barra-fase': 'distribucion', 'barra-neutro': 'distribucion', 'barra-tierra': 'distribucion',
    'peine': 'distribucion', 'bornera': 'distribucion',
    'iluminacion': 'circuito', 'tomacorrientes': 'circuito',
    'aire-acondicionado': 'circuito', 'reserva': 'circuito',
  };

  const SLOT_PX = 34;
  const MAX_SLOTS = 18;

  /* =====================================================================
     2. ESTADO DEL TABLERO
     ================================================================== */
  let placed = [];       // [{ id, type, notes }]
  let selectedId = null;

  const track = document.getElementById('modulesTrack');
  const railWrap = document.getElementById('dinRailWrap');
  const canvasSurface = document.getElementById('canvasSurface');
  const canvasEmpty = document.querySelector('.canvas-empty');
  const propsEmpty = document.getElementById('propsEmpty');
  const propsForm = document.getElementById('propsForm');
  const consoleBody = document.getElementById('consoleBody');
  const sbCountItem = document.querySelector('.statusbar .sb-item');

  function uid() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function totalSlotsUsed(excludeId) {
    return placed.reduce((sum, p) => (p.id === excludeId ? sum : sum + WIDTHS[p.type]), 0);
  }

  function log(message, tag) {
    const tagMap = { info: 'INFO', ok: 'OK', warn: 'ADVERT.', err: 'ERROR' };
    const line = document.createElement('div');
    line.className = 'log-line ' + tag;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    line.innerHTML =
      '<span class="log-time">' + hh + ':' + mm + ':' + ss + '</span>' +
      '<span class="log-tag">' + tagMap[tag] + '</span>' +
      '<span></span>';
    line.lastElementChild.textContent = message;
    consoleBody.appendChild(line);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  }

  /* =====================================================================
     3. RENDER
     ================================================================== */
  function renderRail() {
    track.innerHTML = '';
    placed.forEach((item) => {
      const def = LIBRARY[item.type];
      const el = document.createElement('div');
      el.className = 'rail-module cat-' + CATEGORY[item.type] + (item.id === selectedId ? ' selected' : '');
      el.style.width = (WIDTHS[item.type] * SLOT_PX) + 'px';
      el.draggable = true;
      el.dataset.id = item.id;
      el.title = def.name + ' — ' + def.spec;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'module-remove';
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Eliminar componente');
      removeBtn.textContent = '×';

      const icon = document.createElement('div');
      icon.className = 'module-icon';
      icon.innerHTML = def.iconHTML;

      const label = document.createElement('div');
      label.className = 'module-label';
      label.textContent = def.name;

      el.appendChild(removeBtn);
      el.appendChild(icon);
      el.appendChild(label);
      track.appendChild(el);
    });

    canvasEmpty.style.display = placed.length ? 'none' : 'block';
    sbCountItem.lastChild.textContent = ' ' + placed.length + (placed.length === 1 ? ' componente' : ' componentes');
  }

  function showProps(item) {
    if (!item) {
      selectedId = null;
      propsEmpty.style.display = 'flex';
      propsForm.style.display = 'none';
      return;
    }
    const def = LIBRARY[item.type];
    propsEmpty.style.display = 'none';
    propsForm.style.display = 'flex';

    document.getElementById('fName').value = def.name;
    document.getElementById('fModel').value = '';

    const currentMatch = def.spec.match(/(\d+)\s*A/);
    document.getElementById('fCurrent').value = currentMatch ? currentMatch[0] : '';

    const polesSelect = document.getElementById('fPoles');
    const polesMatch = def.spec.match(/\d+P(\+N)?(\+T)?/);
    if (polesMatch) {
      const opts = Array.from(polesSelect.options).map((o) => o.value);
      polesSelect.value = opts.includes(polesMatch[0]) ? polesMatch[0] : opts[0];
    }
    document.getElementById('fNotes').value = item.notes || '';
  }

  /* =====================================================================
     4. DRAG & DROP: soltar componentes nuevos sobre el riel
     ================================================================== */
  function computeInsertIndex(clientX) {
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    let acc = 0;
    for (let i = 0; i < placed.length; i++) {
      const w = WIDTHS[placed[i].type] * SLOT_PX;
      if (x < acc + w / 2) return i;
      acc += w;
    }
    return placed.length;
  }

  canvasSurface.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.getData('text/reorder-id') ? 'move' : 'copy';
    railWrap.classList.add('drag-over');
  });

  canvasSurface.addEventListener('dragleave', (e) => {
    if (!railWrap.contains(e.relatedTarget)) railWrap.classList.remove('drag-over');
  });

  canvasSurface.addEventListener('drop', (e) => {
    e.preventDefault();
    railWrap.classList.remove('drag-over');

    const newType = e.dataTransfer.getData('text/component-type');
    const reorderId = e.dataTransfer.getData('text/reorder-id');
    const insertIndex = computeInsertIndex(e.clientX);

    if (newType) {
      if (totalSlotsUsed() + WIDTHS[newType] > MAX_SLOTS) {
        log('El riel está lleno — no se puede agregar "' + LIBRARY[newType].name + '".', 'warn');
        return;
      }
      placed.splice(insertIndex, 0, { id: uid(), type: newType, notes: '' });
      log('Componente agregado: ' + LIBRARY[newType].name, 'ok');
      selectedId = placed[insertIndex].id;
      renderRail();
      showProps(placed[insertIndex]);
    } else if (reorderId) {
      const fromIdx = placed.findIndex((p) => p.id === reorderId);
      if (fromIdx === -1) return;
      const [moved] = placed.splice(fromIdx, 1);
      let idx = insertIndex;
      if (fromIdx < idx) idx--;
      placed.splice(idx, 0, moved);
      renderRail();
    }
  });

  /* =====================================================================
     5. INTERACCIÓN CON MÓDULOS YA COLOCADOS (reordenar / seleccionar / borrar)
     ================================================================== */
  track.addEventListener('dragstart', (e) => {
    const mod = e.target.closest('.rail-module');
    if (!mod) return;
    e.dataTransfer.setData('text/reorder-id', mod.dataset.id);
    e.dataTransfer.effectAllowed = 'move';
  });

  canvasSurface.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.module-remove');
    const mod = e.target.closest('.rail-module');

    if (removeBtn && mod) {
      const item = placed.find((p) => p.id === mod.dataset.id);
      placed = placed.filter((p) => p.id !== mod.dataset.id);
      if (selectedId === mod.dataset.id) showProps(null);
      if (item) log('Componente eliminado: ' + LIBRARY[item.type].name, 'warn');
      renderRail();
      return;
    }

    if (mod) {
      selectedId = mod.dataset.id;
      renderRail();
      showProps(placed.find((p) => p.id === selectedId));
      return;
    }

    // Clic en el fondo del canvas: deseleccionar
    showProps(null);
    renderRail();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const activeTag = document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
    if (!selectedId) return;
    const item = placed.find((p) => p.id === selectedId);
    placed = placed.filter((p) => p.id !== selectedId);
    if (item) log('Componente eliminado: ' + LIBRARY[item.type].name, 'warn');
    showProps(null);
    renderRail();
  });

  /* ---- estado inicial ---- */
  renderRail();
});
