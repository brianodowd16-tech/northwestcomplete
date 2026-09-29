/* Gasworks House — room-by-room photo tour. Without JS the filmstrip links open each photo. */
(function () {
	'use strict';

	var root = document.querySelector('[data-tour]');
	var dataEl = root && root.querySelector('[data-tour-data]');
	if (!root || !dataEl) return;

	var rooms;
	try { rooms = JSON.parse(dataEl.textContent); } catch (e) { return; }

	// Flatten to one list of stops, each knowing its room. A room without photos yet is one card stop.
	var photos = [];
	rooms.forEach(function (room, r) {
		if (!room.photos.length) photos.push({ card: true, alt: room.name, room: r });
		room.photos.forEach(function (p) { photos.push({ full: p.full, thumb: p.thumb, alt: p.alt, room: r }); });
	});
	if (!photos.length) return;

	var img = root.querySelector('[data-tour-img]');
	var figure = root.querySelector('.tour-figure');
	var card = root.querySelector('[data-tour-card]');
	var numEl = root.querySelector('[data-tour-num]');
	var nameEl = root.querySelector('[data-tour-name]');
	var bedsEl = root.querySelector('[data-tour-beds]');
	var noteEl = root.querySelector('[data-tour-note]');
	var counterEl = root.querySelector('[data-tour-counter]');
	var strip = root.querySelector('[data-tour-strip]');
	var thumbs = Array.prototype.slice.call(root.querySelectorAll('[data-tour-index]'));
	var roomBtns = Array.prototype.slice.call(root.querySelectorAll('[data-tour-room]'));
	var current = 0;

	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function wrap(i) { return (i + photos.length) % photos.length; }

	function preload(i) { var ph = photos[wrap(i)]; if (!ph.card) { var p = new Image(); p.src = ph.full; } }

	function show(i) {
		current = wrap(i);
		var p = photos[current];
		var room = rooms[p.room];

		figure.classList.toggle('is-card', !!p.card);
		card.hidden = !p.card; // The card sits over the previous photo.
		if (p.card) {
			root.querySelector('[data-tour-card-num]').textContent = pad(p.room + 1);
			root.querySelector('[data-tour-card-name]').textContent = room.name;
			root.querySelector('[data-tour-card-beds]').textContent = room.beds || '';
		} else if (img.getAttribute('src') !== p.full) {
			img.classList.add('is-loading');
			var next = new Image();
			next.onload = next.onerror = function () {
				if (photos[current] !== p) return;
				img.src = p.full;
				img.alt = p.alt;
				img.classList.remove('is-loading');
			};
			next.src = p.full;
		}
		numEl.textContent = pad(p.room + 1);
		nameEl.textContent = room.name;
		bedsEl.textContent = room.beds || '';
		bedsEl.hidden = !room.beds;
		noteEl.textContent = room.note || '';
		counterEl.textContent = (current + 1) + ' / ' + photos.length;

		thumbs.forEach(function (t, k) { t.classList.toggle('is-active', k === current); });
		roomBtns.forEach(function (b, k) {
			if (k === p.room) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
		});
		// Keep the active thumb and room chip in view, without moving the page.
		scrollIntoRow(strip, thumbs[current]);
		var rooms_nav = roomBtns[p.room] && roomBtns[p.room].closest('.tour-rooms');
		if (rooms_nav && rooms_nav.scrollWidth > rooms_nav.clientWidth) scrollIntoRow(rooms_nav, roomBtns[p.room]);

		preload(current + 1);
		preload(current - 1);
		if (box && !box.hidden) renderBox();
	}

	function scrollIntoRow(row, el) {
		if (!row || !el) return;
		var left = el.offsetLeft - row.offsetLeft - (row.clientWidth - el.offsetWidth) / 2;
		row.scrollTo({ left: Math.max(0, left), behavior: prefersReduced() ? 'auto' : 'smooth' });
	}
	function prefersReduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

	/* ---------- Controls ---------- */
	root.addEventListener('click', function (e) {
		var step = e.target.closest('[data-tour-step]');
		var thumb = e.target.closest('[data-tour-index]');
		var roomBtn = e.target.closest('[data-tour-room]');
		if (step) { show(current + +step.getAttribute('data-tour-step')); return; }
		if (thumb) { e.preventDefault(); show(+thumb.getAttribute('data-tour-index')); return; }
		if (roomBtn) {
			var r = +roomBtn.getAttribute('data-tour-room');
			for (var k = 0; k < photos.length; k++) { if (photos[k].room === r) { show(k); break; } }
			return;
		}
		if (e.target.closest('[data-tour-open]') && !photos[current].card) openBox();
	});

	// Arrow keys while the tour has focus.
	root.addEventListener('keydown', function (e) {
		if (e.key === 'ArrowRight') { show(current + 1); e.preventDefault(); }
		if (e.key === 'ArrowLeft') { show(current - 1); e.preventDefault(); }
	});

	swipe(root.querySelector('.tour-open'), function (dir) { show(current + dir); });

	/* ---------- Swipe ---------- */
	function swipe(el, cb) {
		if (!el) return;
		var x0 = null, y0 = null, moved = false;
		el.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; moved = false; }, { passive: true });
		el.addEventListener('touchmove', function () { moved = true; }, { passive: true });
		el.addEventListener('touchend', function (e) {
			if (x0 === null || !moved) return;
			var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
			x0 = null;
			if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
				cb(dx < 0 ? 1 : -1);
				el.dataset.swiped = '1';
				setTimeout(function () { delete el.dataset.swiped; }, 350);
			}
		});
		// A swipe shouldn't also count as a tap that opens full screen.
		el.addEventListener('click', function (e) { if (el.dataset.swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
	}

	/* ---------- Full-screen viewer ---------- */
	var box = null, boxImg, boxTitle, boxNote, lastFocus;

	function buildBox() {
		box = document.createElement('div');
		box.className = 'tour-box';
		box.setAttribute('role', 'dialog');
		box.setAttribute('aria-modal', 'true');
		box.setAttribute('aria-label', 'Photo tour');
		box.hidden = true;
		box.innerHTML =
			'<div class="tour-box-bar"><p class="tour-box-title" data-box-title></p>' +
			'<button type="button" class="tour-box-close" data-box-close aria-label="Close">×</button></div>' +
			'<div class="tour-box-stage"><img alt="" data-box-img>' +
			'<button type="button" class="tour-arrow tour-prev" data-box-step="-1" aria-label="Previous photo">‹</button>' +
			'<button type="button" class="tour-arrow tour-next" data-box-step="1" aria-label="Next photo">›</button></div>' +
			'<p class="tour-box-note" data-box-note></p>';
		document.body.appendChild(box);
		boxImg = box.querySelector('[data-box-img]');
		boxTitle = box.querySelector('[data-box-title]');
		boxNote = box.querySelector('[data-box-note]');

		box.addEventListener('click', function (e) {
			var step = e.target.closest('[data-box-step]');
			if (step) { boxStep(+step.getAttribute('data-box-step')); return; }
			if (e.target.closest('[data-box-close]') || e.target.classList.contains('tour-box-stage')) closeBox();
		});
		box.addEventListener('keydown', function (e) {
			if (e.key === 'Escape') closeBox();
			if (e.key === 'ArrowRight') boxStep(1);
			if (e.key === 'ArrowLeft') boxStep(-1);
			if (e.key === 'Tab') {
				// Keep focus inside the viewer.
				var f = box.querySelectorAll('button');
				if (e.shiftKey && document.activeElement === f[0]) { f[f.length - 1].focus(); e.preventDefault(); }
				else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { f[0].focus(); e.preventDefault(); }
			}
		});
		swipe(box.querySelector('.tour-box-stage'), boxStep);
	}

	// Full screen only shows real photos, so skip over any room cards.
	function boxStep(dir) {
		var i = current;
		for (var n = 0; n < photos.length; n++) {
			i = wrap(i + dir);
			if (!photos[i].card) { show(i); return; }
		}
	}

	function renderBox() {
		var p = photos[current], room = rooms[p.room];
		boxImg.src = p.full;
		boxImg.alt = p.alt;
		boxTitle.innerHTML = '';
		boxTitle.appendChild(document.createTextNode(room.name));
		var c = document.createElement('span');
		c.textContent = (current + 1) + ' / ' + photos.length;
		boxTitle.appendChild(c);
		boxNote.textContent = p.alt;
	}

	function openBox() {
		if (!box) buildBox();
		lastFocus = document.activeElement;
		box.hidden = false;
		document.body.style.overflow = 'hidden';
		renderBox();
		box.querySelector('[data-box-close]').focus();
	}

	function closeBox() {
		box.hidden = true;
		document.body.style.overflow = '';
		if (lastFocus) lastFocus.focus();
	}

	show(0);
})();
