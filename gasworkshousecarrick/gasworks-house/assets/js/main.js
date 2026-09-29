/* Gasworks House — small progressive enhancements. The site works without JS. */
(function () {
	'use strict';

	var header = document.querySelector('[data-header]');
	var toggle = document.querySelector('[data-nav-toggle]');
	var mobileCta = document.querySelector('[data-mobile-cta]');
	var hero = document.querySelector('.hero');

	// Header background + mobile CTA once scrolled past the hero.
	function onScroll() {
		var y = window.scrollY;
		if (header) header.classList.toggle('is-scrolled', y > 40);
		if (mobileCta && hero) {
			var pastHero = y > hero.offsetHeight - 200;
			var nearForm = false;
			var form = document.getElementById('book');
			if (form) {
				var r = form.getBoundingClientRect();
				nearForm = r.top < window.innerHeight && r.bottom > 0;
			}
			mobileCta.classList.toggle('is-visible', pastHero && !nearForm);
		}
	}
	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	// Mobile menu.
	function setNav(open) {
		header.classList.toggle('nav-open', open);
		toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
		document.body.style.overflow = open ? 'hidden' : '';
	}
	if (toggle && header) {
		toggle.addEventListener('click', function () {
			setNav(!header.classList.contains('nav-open'));
		});
		header.querySelectorAll('.site-nav a').forEach(function (a) {
			a.addEventListener('click', function () { setNav(false); });
		});
		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && header.classList.contains('nav-open')) setNav(false);
		});
	}

	// Hen / stag tabs.
	var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-tab]'));
	function selectTab(tab) {
		tabs.forEach(function (t) {
			var on = t === tab;
			t.setAttribute('aria-selected', on ? 'true' : 'false');
			t.tabIndex = on ? 0 : -1;
			document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
		});
	}
	tabs.forEach(function (tab, i) {
		tab.addEventListener('click', function () { selectTab(tab); });
		tab.addEventListener('keydown', function (e) {
			if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
			var next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
			selectTab(next);
			next.focus();
		});
	});

	// "Plan the hen/stag" buttons preselect the occasion in the form.
	var partySelect = document.querySelector('[data-party-select]');
	document.querySelectorAll('[data-party]').forEach(function (btn) {
		btn.addEventListener('click', function () {
			if (partySelect) partySelect.value = btn.getAttribute('data-party');
		});
	});

})();
