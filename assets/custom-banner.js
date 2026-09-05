/**
 * Custom Banner Section
 * Handles the mobile hamburger/close toggle for the top bar dropdown panel.
 * Vanilla JS only — no jQuery.
 */
document.addEventListener('DOMContentLoaded', function () {
  var toggles = document.querySelectorAll('.custom-banner__topbar-toggle');

  toggles.forEach(function (toggle) {
    toggle.addEventListener('click', function () {
      var expanded = toggle.getAttribute('aria-expanded') === 'true';
      var panelId = toggle.getAttribute('aria-controls');
      var panel = document.getElementById(panelId);

      if (!panel) return;

      toggle.setAttribute('aria-expanded', String(!expanded));

      if (expanded) {
        panel.setAttribute('hidden', '');
      } else {
        panel.removeAttribute('hidden');
      }
    });
  });
});
