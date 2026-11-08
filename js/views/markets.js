// Markets view — placeholder; replaced by the full view.
(() => {
  'use strict';
  globalThis.Views.markets = {
    title: 'Markets',
    mount(root, { Store, UI, params }) {
      const body = UI.el('div', { class: 'card' });
      root.append(UI.el('div', { class: 'view-title' }, [UI.el('h1', { text: 'Markets' + (params.id ? ' · ' + params.id : '') })]), body);
      const draw = ({ result }) => {
        body.textContent = result
          ? `${UI.num(result.summary.finalMaterialTPerYear)} t/yr of material in ${result.timeline.at(-1).year}`
          : 'Simulating…';
      };
      draw(Store);
      return Store.subscribe(draw);
    },
  };
})();
