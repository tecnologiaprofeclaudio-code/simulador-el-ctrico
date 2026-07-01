/* =========================================================================
   main.js — punto de entrada de la aplicación.

   ESTADO ACTUAL: solo interacciones mínimas de interfaz (tema, acordeones,
   tabs) para que el index.html se vea y se sienta funcional.

   PRÓXIMOS MÓDULOS A CONECTAR (no implementados todavía):
     scripts/components/   -> definición y fábrica de cada componente eléctrico
     scripts/simulation/   -> motor de cálculo (tensión, corriente, fallas)
     scripts/ui/            -> drag&drop, selección múltiple, undo/redo, zoom
   ========================================================================= */

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Tema claro / oscuro ---- */
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  themeToggle.addEventListener('click', () => {
    const next = body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    body.setAttribute('data-theme', next);
  });

  /* ---- Acordeones de categorías en la biblioteca ---- */
  document.querySelectorAll('.category-head').forEach((head) => {
    head.addEventListener('click', () => {
      head.parentElement.classList.toggle('collapsed');
    });
  });

  /* ---- Tabs de la consola inferior ---- */
  document.querySelectorAll('.console-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.console-tab').forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  /* ---- Placeholder: seleccionar una tarjeta de componente resalta
     visualmente el panel de propiedades (sin lógica de simulación aún) ---- */
  const propsEmpty = document.getElementById('propsEmpty');
  const propsForm = document.getElementById('propsForm');
  document.querySelectorAll('.comp-card').forEach((card) => {
    card.addEventListener('click', () => {
      propsEmpty.style.display = 'none';
      propsForm.style.display = 'flex';
      const name = card.querySelector('.comp-name').textContent;
      document.getElementById('fName').value = name;
    });
  });

  /* ---- Botón Simular: placeholder visual (el motor de cálculo se
     conectará en scripts/simulation/) ---- */
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

});
