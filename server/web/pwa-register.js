(function registerTeamTaskPwa() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .getRegistrations()
      .then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.update(); }));
      })
      .then(function () {
        return navigator.serviceWorker.register('/sw.js?v=1788510014275', {
          scope: '/',
          updateViaCache: 'none',
        });
      })
      .catch(function () {});
  });
  // Auto-reload once when a new service worker takes over to ensure assets are fresh
  var refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
})();
