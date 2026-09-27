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
			var form = document.getElementById('enquire');
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

	// Departure can't be before arrival.
	var arrival = document.querySelector('input[name="arrival"]');
	var departure = document.querySelector('input[name="departure"]');
	if (arrival && departure) {
		var today = new Date().toISOString().slice(0, 10);
		arrival.min = today;
		departure.min = today;
		arrival.addEventListener('change', function () {
			departure.min = arrival.value || today;
			if (departure.value && departure.value < arrival.value) departure.value = '';
		});
	}

	// Refresh the form's nonce so cached pages still submit.
	var enquiry = document.querySelector('[data-nonce-url]');
	if (enquiry && window.fetch) {
		fetch(enquiry.getAttribute('data-nonce-url'), { credentials: 'same-origin', cache: 'no-store' })
			.then(function (r) { return r.json(); })
			.then(function (res) {
				var field = enquiry.querySelector('input[name="gwh_nonce"]');
				if (res && res.success && field) field.value = res.data;
			})
			.catch(function () {});
	}

	// Simple gallery lightbox.
	document.querySelectorAll('[data-lightbox]').forEach(function (link) {
		link.addEventListener('click', function (e) {
			e.preventDefault();
			var box = document.createElement('div');
			box.className = 'lightbox';
			box.setAttribute('role', 'dialog');
			box.setAttribute('aria-label', 'Photo');
			var img = document.createElement('img');
			img.src = link.href;
			img.alt = (link.querySelector('img') || {}).alt || '';
			box.appendChild(img);
			function close() { box.remove(); document.removeEventListener('keydown', onKey); link.focus(); }
			function onKey(ev) { if (ev.key === 'Escape') close(); }
			box.addEventListener('click', close);
			document.addEventListener('keydown', onKey);
			document.body.appendChild(box);
		});
	});
})();
