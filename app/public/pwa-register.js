(function registerTeamTaskPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.update(); }));
      })
      .then(function () {
        return navigator.serviceWorker.register('/sw.js?v=__BUILD__', {
          scope: '/',
          updateViaCache: 'none',
        });
      })
      .catch(function () {});
  });
})();
