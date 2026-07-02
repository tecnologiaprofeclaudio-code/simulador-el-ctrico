/* =========================================================================
   main.js — punto de entrada de la aplicación.

   MÓDULOS ACTIVOS:
     - Tema claro/oscuro, acordeones, tabs de consola (interfaz general)
     - Arrastre de componentes (biblioteca -> riel DIN) usando Pointer Events,
       compatible con mouse Y con pantallas táctiles (celular/tablet).
     - Reordenar / seleccionar / eliminar componentes ya colocados
     - Panel de propiedades: se completa con datos reales al seleccionar

   NOTA TÉCNICA: se usa la API de Pointer Events (pointerdown/move/up) en
   lugar del Drag & Drop nativo de HTML5 (dragstart/dragover/drop), porque
   ese último NO funciona en pantallas táctiles. Pointer Events sí unifica
   mouse, lápiz y dedo con la misma lógica.

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
  });

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
  const DRAG_THRESHOLD = 6; // px de movimiento antes de considerar que es un arrastre y no un toque

  /* =====================================================================
     2. ESTADO DEL TABLERO
     ================================================================== */
  let placed = [];       // [{ id, type, notes }]
  let selectedId = null;

  const library = document.querySelector('.library');
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

  function removeComponent(id) {
    const item = placed.find((p) => p.id === id);
    placed = placed.filter((p) => p.id !== id);
    if (selectedId === id) showProps(null);
    if (item) log('Componente eliminado: ' + LIBRARY[item.type].name, 'warn');
    renderRail();
  }

  function selectComponent(id) {
    selectedId = id;
    renderRail();
    showProps(placed.find((p) => p.id === id));
  }

  /* =====================================================================
     4. ARRASTRE (Pointer Events — funciona con mouse, lápiz y dedo)
     ================================================================== */
  let drag = null; // { kind:'new'|'reorder', componentType, moduleId, startX, startY, dragging, ghost }

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

  function isOverRail(clientX, clientY) {
    const r = railWrap.getBoundingClientRect();
    const pad = 40; // margen de tolerancia para soltar más fácil
    return clientX >= r.left - pad && clientX <= r.right + pad &&
           clientY >= r.top - pad && clientY <= r.bottom + pad;
  }

  function makeGhost(iconHTML, name) {
    const g = document.createElement('div');
    g.className = 'drag-ghost';
    g.style.width = '64px';
    g.innerHTML =
      '<div class="module-icon">' + iconHTML + '</div>' +
      '<div class="module-label">' + name + '</div>';
    document.body.appendChild(g);
    return g;
  }

  function startDrag(e, opts) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag = {
      kind: opts.kind,
      componentType: opts.componentType,
      moduleId: opts.moduleId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      dragging: false,
      ghost: null,
      pointerId: e.pointerId,
    };
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
  }

  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    if (!drag.dragging) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      drag.dragging = true;

      // Al confirmar el arrastre, crear el "fantasma" que sigue al dedo/cursor
      const def = drag.kind === 'new' ? LIBRARY[drag.componentType]
        : LIBRARY[placed.find((p) => p.id === drag.moduleId).type];
      drag.ghost = makeGhost(def.iconHTML, def.name);

      // Si es reordenamiento, ocultamos visualmente el módulo original mientras se mueve
      if (drag.kind === 'reorder') {
        const el = track.querySelector('[data-id="' + drag.moduleId + '"]');
        if (el) el.style.opacity = '.25';
      }
    }

    e.preventDefault();
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    railWrap.classList.toggle('drag-over', isOverRail(e.clientX, e.clientY));
  }

  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    railWrap.classList.remove('drag-over');

    if (drag.dragging) {
      if (drag.ghost) drag.ghost.remove();
      if (drag.kind === 'reorder') {
        const el = track.querySelector('[data-id="' + drag.moduleId + '"]');
        if (el) el.style.opacity = '';
      }

      const dropped = isOverRail(drag.lastX, drag.lastY);
      if (dropped) {
        const insertIndex = computeInsertIndex(drag.lastX);

        if (drag.kind === 'new') {
          if (totalSlotsUsed() + WIDTHS[drag.componentType] > MAX_SLOTS) {
            log('El riel está lleno — no se puede agregar "' + LIBRARY[drag.componentType].name + '".', 'warn');
          } else {
            const newItem = { id: uid(), type: drag.componentType, notes: '' };
            placed.splice(insertIndex, 0, newItem);
            log('Componente agregado: ' + LIBRARY[drag.componentType].name, 'ok');
            selectComponent(newItem.id);
          }
        } else if (drag.kind === 'reorder') {
          const fromIdx = placed.findIndex((p) => p.id === drag.moduleId);
          if (fromIdx !== -1) {
            const [moved] = placed.splice(fromIdx, 1);
            let idx = insertIndex;
            if (fromIdx < idx) idx--;
            placed.splice(idx, 0, moved);
          }
        }
        renderRail();
      }
    } else {
      // No hubo arrastre real: fue un toque/clic simple
      if (drag.kind === 'reorder') selectComponent(drag.moduleId);
    }

    drag = null;
  }

  // Origen 1: tarjetas de la biblioteca (siempre agregan un componente nuevo)
  library.addEventListener('pointerdown', (e) => {
    const card = e.target.closest('.comp-card');
    if (!card) return;
    startDrag(e, { kind: 'new', componentType: card.dataset.component });
  });

  // Origen 2: módulos ya colocados en el riel (reordenar o, si no se mueve, seleccionar)
  track.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.module-remove')) return; // el botón de borrar se maneja aparte
    const mod = e.target.closest('.rail-module');
    if (!mod) return;
    startDrag(e, { kind: 'reorder', moduleId: mod.dataset.id });
  });

  // Botón de eliminar y clic en fondo vacío del canvas para deseleccionar
  canvasSurface.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('.module-remove');
    if (removeBtn) {
      const mod = e.target.closest('.rail-module');
      if (mod) removeComponent(mod.dataset.id);
      return;
    }
    if (!e.target.closest('.rail-module')) {
      showProps(null);
      renderRail();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    const activeTag = document.activeElement.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;
    if (!selectedId) return;
    removeComponent(selectedId);
  });

  /* ---- estado inicial ---- */
  renderRail();
});
